-- =====================================================================
-- 0022_active_slot_today_only.sql — Slot aktif cuma hitung kontak yang
-- BUTUH dikerjakan HARI INI, bukan seluruh backlog In Progress/Warm.
-- =====================================================================
--
-- MASALAH: "Slot aktif" (yang mengunci tombol "Ambil Data Baru") selama
-- ini = Uncalled + In Progress + Warm, TANPA melihat kapan terakhir
-- dihubungi. Kontak yang SUDAH ditelepon tapi hasilnya belum final
-- (Tidak diangkat, Minta telepon lain, Masih pikir-pikir, dst) tetap
-- terhitung aktif SELAMANYA sampai dapat hasil final - jadi agent yang
-- rajin menelepon habis antreannya tetap terkunci karena backlog lama
-- menumpuk, padahal dia sudah kerjakan semuanya untuk hari itu.
--
-- PERBAIKAN: kontak SUDAH ditelepon (last_contacted_at terisi) cuma
-- dihitung aktif kalau:
--   - terakhir dihubungi HARI INI (masih "kerjaan hari ini"), ATAU
--   - follow-up-nya jatuh HARI INI atau SUDAH LEWAT ("Hari H" atau
--     terlambat - supaya follow-up yang kelewat tidak hilang dari
--     hitungan begitu saja, tetap kelihatan aktif sampai ditindaklanjuti)
-- Kontak yang terakhir dihubungi di HARI LAIN dan follow-up-nya belum
-- jatuh tempo TIDAK dihitung - baru muncul lagi di hitungan aktif pas
-- hari follow-up-nya tiba (atau kalau dihubungi ulang hari itu juga).
-- Kontak 'Uncalled' (belum pernah disentuh) SELALU dihitung, seperti
-- semula.
--
-- Patokan "hari ini" pakai WIB (UTC+7 tetap, tanpa DST) - pola manual
-- yang sama dipakai lib/wib-date.ts di sisi aplikasi, supaya "hari ini"
-- di database dan di UI selalu sama.
--
-- SCOPE SENGAJA DIBATASI ke fungsi yang menentukan "bisa ambil data
-- baru atau tidak" (get_agent_active_slots, assign_contacts_to_agent -
-- dipakai baik tombol self-claim agent MAUPUN assign manual admin lewat
-- app/actions/contacts.ts). TIDAK mengubah:
--   - lib/contacts.ts getAgentCapacitiesBulk() (dipakai auto-distribusi
--     saat import CSV) - sengaja tetap hitung backlog PENUH supaya import
--     tidak menumpuk data baru ke agent yang sebenarnya masih punya
--     banyak follow-up tertunda, walau tidak jatuh tempo hari ini.
--   - app/(dashboard)/admin/agents/page.tsx activeSlotCount (kolom
--     "Slot Aktif" di report) - itu metrik pelaporan/KPI, harus tetap
--     menunjukkan backlog SEBENARNYA untuk pengawasan admin, bukan cuma
--     kerjaan hari ini.
--
-- TEMUAN TAMBAHAN yang ikut diperbaiki di sini: tiga tempat berbeda
-- punya angka hard-ceiling yang TIDAK KONSISTEN satu sama lain -
-- get_agent_active_slots (0010) masih 70, assign_contacts_to_agent
-- (0014) sudah 150, dan app/actions/contacts.ts assignContacts() juga
-- masih hardcode 70 di JS. Disamakan semua ke 150 (angka yang paling
-- baru dan sengaja dinaikkan di 0014 berdasar pengalaman lapangan).

-- ---------------------------------------------------------------------
-- 1. Helper terpusat - satu definisi "aktif hari ini", dipakai di semua
--    fungsi kapasitas supaya tidak ada lagi logic yang bercabang beda.
-- ---------------------------------------------------------------------
create or replace function public.is_contact_active_today(
  p_status_call       text,
  p_last_contacted_at timestamptz,
  p_next_follow_up_at timestamptz
)
returns boolean
language sql
stable
as $$
  select
    p_status_call = 'Uncalled'
    or (
      p_status_call in ('In Progress', 'Warm')
      and (
        coalesce(
          (p_last_contacted_at + interval '7 hours')::date = (now() + interval '7 hours')::date,
          false
        )
        or coalesce(
          (p_next_follow_up_at + interval '7 hours')::date <= (now() + interval '7 hours')::date,
          false
        )
      )
    )
$$;

comment on function public.is_contact_active_today is
  'Satu-satunya definisi "kontak dihitung slot aktif hari ini" - Uncalled '
  'selalu aktif; In Progress/Warm cuma aktif kalau terakhir dihubungi hari '
  'ini atau follow-up-nya jatuh tempo hari ini/terlambat. Lihat migrasi '
  '0022_active_slot_today_only.sql.';

-- ---------------------------------------------------------------------
-- 2. get_agent_active_slots — dipakai tombol "Ambil Data Baru" (state
--    enabled/disabled + angka "X aktif / Y kapasitas" yang ditampilkan)
--    dan admin assignContacts() untuk cek kapasitas sebelum assign manual.
-- ---------------------------------------------------------------------
create or replace function public.get_agent_active_slots(p_agent_id uuid)
returns table(
  active_count int,
  kapasitas    int,
  available    int,
  is_full      boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kapasitas int;
  v_active    int;
begin
  select kapasitas_data into v_kapasitas
  from public.users where id = p_agent_id;

  select count(*) into v_active
  from public.contacts
  where assigned_to = p_agent_id
    and public.is_contact_active_today(status_call, last_contacted_at, next_follow_up_at);

  return query select
    v_active,
    v_kapasitas,
    greatest(0, least(v_kapasitas, 150) - v_active),
    v_active >= least(v_kapasitas, 150);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. assign_contacts_to_agent — RPC yang benar-benar dipanggil saat
--    klaim (self-claim maupun via assign_contacts_atomic TIDAK dipakai
--    di sini, tapi fungsi klaim batch ini yang dipanggil dari tombol
--    "Ambil Data Baru"). Isinya sama persis dengan 0014, cuma bagian
--    hitung v_active_count yang diganti pakai helper baru.
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
  v_inprog_daily_cap   constant int := 40;
  v_agent_name         text;
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

  -- PRIORITAS 1: Recycled Warm (dibatasi cap harian, bukan cap per klik)
  if v_warm_cap_remaining > 0 then
    select array_agg(id) into v_warm_ids
    from (
      select c.id from public.contacts c
      where c.status_call = 'Warm'
        and c.assigned_to is null
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

  -- PRIORITAS 2: Recycled In Progress (dibatasi cap harian)
  if v_assigned_total < v_actual_batch and v_inprog_cap_remaining > 0 then
    select array_agg(id) into v_inprog_ids
    from (
      select c.id from public.contacts c
      where c.status_call = 'In Progress'
        and c.assigned_to is null
        and exists (
          select 1 from public.call_logs cl
          where cl.contact_id = c.id
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

  -- PRIORITAS 3: Fresh Uncalled (isi sisa slot, tanpa cap)
  if v_assigned_total < v_actual_batch then
    select array_agg(id) into v_fresh_ids
    from (
      select id from public.contacts
      where status_call = 'Uncalled'
        and assigned_to is null
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
    return query select 0,
      'Tidak ada data tersedia di pool saat ini.';
    return;
  end if;

  return query select v_assigned_total, null::text;
end;
$$;
