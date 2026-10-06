-- =====================================================================
-- 0027_daur_ulang_pagar_percobaan.sql — dahulukan kerja daur ulang, dengan
-- pagar supaya nomor yang sama tidak didering berlebihan.
-- =====================================================================
--
-- LATAR BELAKANG:
-- Data menunjukkan menelepon ulang kontak yang sudah pernah bicara
-- menghasilkan 1 Hot Lead per 11 panggilan; nomor baru 1 per 1.309
-- panggilan. Jadi klaim harus mendahulukan daur ulang (Warm, lalu In
-- Progress), dengan pagar supaya satu nomor tidak ditelepon terus.
--
-- ISI (empat perubahan, satu migrasi):
--   A. Pagar percobaan di assign_contacts_to_agent - HANYA tahap In
--      Progress: kontak harus punya < 3 baris call_logs DAN belum ada
--      call log untuk kontak itu pada tanggal hari ini (WIB). Tahap Warm
--      SENGAJA tidak dibatasi (Warm punya janji follow-up dari nasabah).
--      Pagar ini cuma di jalur klaim; kontak yang SUDAH dipegang agen tidak
--      lewat RPC ini, jadi tidak ikut terbatasi (disengaja - memblokir
--      simpan call log akan menghalangi pekerjaan yang sah).
--   B. Cap harian In Progress 40 -> 120 (Warm tetap 30).
--   C. Cron auto-reshuffle-overdue-followup: kontak yang follow-up-nya
--      belum jatuh tempo tidak dilepas (aturan jadwal mengizinkan sampai 7
--      hari, cron melepas setelah 3 hari tanpa aktivitas), plus
--      pengecualian arsip di cron dan di ketiga tahap RPC.
--   D. Dua kunci system_config: uncalled_claim_enabled ('true') dan
--      target_panggilan_per_agen ('160'). Tahap Uncalled di RPC dilewati
--      kalau uncalled_claim_enabled = 'false'.
--
-- DASAR DEFINISI:
--   - assign_contacts_to_agent: salinan 0022 (definisi terbaru), hanya
--     bagian di atas yang berubah. Signature & tipe kembalian sama, jadi
--     grant yang sudah ada ikut terbawa.
--   - cron: salinan 0025 (BUKAN 0018 - 0025 sudah menambah syarat
--     next_follow_up_at; di sini <= diganti < dan syarat arsip ditambah).
--
-- Idempoten: create or replace function, cron.schedule meng-upsert job
-- berdasarkan nama, insert system_config pakai on conflict do nothing.
-- Tidak mengubah data kontak apa pun.
--
-- CATATAN: belum ada kode yang membaca target_panggilan_per_agen - kunci
-- ini baru disiapkan nilainya.
--
-- ROLLBACK: jalankan ulang definisi fungsi dari 0022 dan blok cron dari
-- 0025 (versi sebelum migrasi ini). Kunci system_config boleh dibiarkan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- D. Kunci system_config (nilai awal; tidak menimpa kalau sudah ada).
-- ---------------------------------------------------------------------
insert into public.system_config (key, value) values
  ('uncalled_claim_enabled', 'true'),
  ('target_panggilan_per_agen', '160')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- A + B + C(arsip) + D. assign_contacts_to_agent
-- ---------------------------------------------------------------------
create or replace function public.assign_contacts_to_agent(
  p_agent_id uuid,
  p_batch_size int default 50
)
returns table(assigned_count int, rejected_reason text)
language plpgsql
security definer
as $$
declare
  v_kapasitas          int;
  v_agent_status       text;
  v_active_count       int;
  v_available          int;
  v_actual_batch       int;
  v_assigned_total     int := 0;
  v_warm_ids           uuid[];
  v_inprog_ids         uuid[];
  v_fresh_ids          uuid[];
  v_warm_taken_today   int;
  v_inprog_taken_today int;
  v_counter_date       date;
  v_warm_cap_remaining   int;
  v_inprog_cap_remaining int;
  v_warm_daily_cap     constant int := 30;
  v_inprog_daily_cap   constant int := 120;
  v_agent_name         text;
  v_uncalled_enabled   text;
  v_uncalled_off       boolean;
begin
  select kapasitas_data, agent_status, name,
         recycled_warm_taken_today, recycled_inprogress_taken_today,
         recycled_counter_date
  into v_kapasitas, v_agent_status, v_agent_name,
       v_warm_taken_today, v_inprog_taken_today, v_counter_date
  from public.users
  where id = p_agent_id and is_active = true;

  if not found then
    return query select 0, 'Agent tidak ditemukan atau tidak aktif';
    return;
  end if;

  if v_agent_status = 'pause' then
    return query select 0,
      'Akunmu sedang di-pause. Hubungi admin untuk mengaktifkan kembali.';
    return;
  end if;

  -- Saklar tahap Uncalled. Baris tidak ada / kosong = dianggap aktif.
  select value into v_uncalled_enabled
  from public.system_config
  where key = 'uncalled_claim_enabled';
  v_uncalled_off := lower(btrim(coalesce(v_uncalled_enabled, 'true'))) = 'false';

  -- Reset counter recycled kalau sudah ganti hari
  if v_counter_date < current_date then
    v_warm_taken_today := 0;
    v_inprog_taken_today := 0;
    update public.users
    set recycled_warm_taken_today = 0,
        recycled_inprogress_taken_today = 0,
        recycled_counter_date = current_date
    where id = p_agent_id;
  end if;

  -- Hitung active slots - HANYA yang butuh dikerjakan hari ini (Uncalled
  -- selalu, In Progress/Warm cuma kalau terakhir dihubungi hari ini atau
  -- follow-up jatuh tempo hari ini/terlambat). Lihat is_contact_active_today().
  select count(*) into v_active_count
  from public.contacts
  where assigned_to = p_agent_id
    and public.is_contact_active_today(status_call, last_contacted_at, next_follow_up_at);

  -- Hard ceiling 150
  if v_active_count >= 150 then
    return query select 0,
      'Batas maksimum sistem tercapai (150 kontak aktif). ' ||
      'Selesaikan kontak yang ada dulu.';
    return;
  end if;

  v_available := least(v_kapasitas, 150) - v_active_count;

  if v_available <= 0 then
    return query select 0,
      'Antrean aktif penuh (' || v_active_count ||
      ' dari ' || v_kapasitas || '). Selesaikan kontak yang ada dulu.';
    return;
  end if;

  v_actual_batch := least(p_batch_size, v_available, 50);

  -- Sisa cap harian recycled
  v_warm_cap_remaining := greatest(0, v_warm_daily_cap - v_warm_taken_today);
  v_inprog_cap_remaining := greatest(0, v_inprog_daily_cap - v_inprog_taken_today);

  -- PRIORITAS 1: Recycled Warm (dibatasi cap harian, bukan cap per klik).
  -- TANPA pagar percobaan - Warm punya janji follow-up dari nasabah.
  if v_warm_cap_remaining > 0 then
    select array_agg(id) into v_warm_ids
    from (
      select c.id from public.contacts c
      where c.status_call = 'Warm'
        and c.assigned_to is null
        and not (coalesce(c.tags, '{}') @> '{ARSIP}')
        and exists (
          select 1 from public.call_logs cl
          where cl.contact_id = c.id
        )
      order by c.updated_at asc
      limit least(v_warm_cap_remaining, v_actual_batch)
      for update skip locked
    ) sub;

    if v_warm_ids is not null then
      update public.contacts
      set assigned_to = p_agent_id, assigned_at = now()
      where id = any(v_warm_ids);
      v_assigned_total := array_length(v_warm_ids, 1);

      update public.users
      set recycled_warm_taken_today = recycled_warm_taken_today +
          array_length(v_warm_ids, 1)
      where id = p_agent_id;
    end if;
  end if;

  -- PRIORITAS 2: Recycled In Progress (dibatasi cap harian) + PAGAR
  -- PERCOBAAN: < 3 call log, dan belum ada call log hari ini (WIB).
  if v_assigned_total < v_actual_batch and v_inprog_cap_remaining > 0 then
    select array_agg(id) into v_inprog_ids
    from (
      select c.id from public.contacts c
      where c.status_call = 'In Progress'
        and c.assigned_to is null
        and not (coalesce(c.tags, '{}') @> '{ARSIP}')
        and exists (
          select 1 from public.call_logs cl
          where cl.contact_id = c.id
        )
        and (
          select count(*) from public.call_logs cl
          where cl.contact_id = c.id
        ) < 3
        and not exists (
          select 1 from public.call_logs cl
          where cl.contact_id = c.id
            and (cl."timestamp" + interval '7 hours')::date
                = (now() + interval '7 hours')::date
        )
      order by c.updated_at asc
      limit least(v_inprog_cap_remaining, v_actual_batch - v_assigned_total)
      for update skip locked
    ) sub;

    if v_inprog_ids is not null then
      update public.contacts
      set assigned_to = p_agent_id, assigned_at = now()
      where id = any(v_inprog_ids);
      v_assigned_total := v_assigned_total + array_length(v_inprog_ids, 1);

      update public.users
      set recycled_inprogress_taken_today = recycled_inprogress_taken_today +
          array_length(v_inprog_ids, 1)
      where id = p_agent_id;
    end if;
  end if;

  -- PRIORITAS 3: Fresh Uncalled (isi sisa slot, tanpa cap) - dilewati
  -- sepenuhnya kalau saklar uncalled_claim_enabled = 'false'.
  if v_assigned_total < v_actual_batch and not v_uncalled_off then
    select array_agg(id) into v_fresh_ids
    from (
      select id from public.contacts
      where status_call = 'Uncalled'
        and assigned_to is null
        and not (coalesce(tags, '{}') @> '{ARSIP}')
      order by created_at asc
      limit v_actual_batch - v_assigned_total
      for update skip locked
    ) sub;

    if v_fresh_ids is not null then
      update public.contacts
      set assigned_to = p_agent_id, assigned_at = now()
      where id = any(v_fresh_ids);
      v_assigned_total := v_assigned_total + array_length(v_fresh_ids, 1);
    end if;
  end if;

  if v_assigned_total = 0 then
    if v_uncalled_off then
      return query select 0,
        'Tidak ada data daur ulang tersedia, dan pengambilan data baru ' ||
        '(Uncalled) sedang dinonaktifkan admin.';
    else
      return query select 0,
        'Tidak ada data tersedia di pool saat ini.';
    end if;
    return;
  end if;

  return query select v_assigned_total, null::text;
end;
$$;

-- ---------------------------------------------------------------------
-- C. Cron auto-reshuffle-overdue-followup (dasar: 0025).
-- Kontak yang follow-up-nya belum jatuh tempo tidak dilepas; arsip tidak
-- pernah dilepas. cron.schedule dengan nama yang sama meng-upsert job.
-- ---------------------------------------------------------------------
select cron.schedule(
  'auto-reshuffle-overdue-followup',
  '0 23 * * *',
  $$
  update public.contacts
  set
    assigned_to = null,
    assigned_at = null,
    notes = coalesce(notes, '') ||
      E'\n[Auto-reshuffle ' || now()::date ||
      ': follow-up tidak ditindaklanjuti 3 hari]'
  where
    status_call in ('Warm', 'In Progress', 'Inbound')
    and assigned_to is not null
    and updated_at <= now() - interval '3 days'
    and (next_follow_up_at is null or next_follow_up_at < now())
    and not (coalesce(tags, '{}') @> '{ARSIP}')
    and assigned_to in (
      select id from public.users where agent_status = 'active'
    );
  $$
);
