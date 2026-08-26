-- =====================================================================
-- 0014_capacity_recycled_cap.sql — Kapasitas naik ke skala real (100/150)
-- + cap absolut harian untuk recycled Warm/In Progress.
-- =====================================================================
-- Kapasitas default sebelumnya (35 aktif / 70 hard ceiling) berdasarkan
-- asumsi awal yang keliru. Berdasarkan pengalaman lapangan real (manual
-- dial 150-180 unique customer/hari per agen), dinaikkan ke 100/150.
-- Batch "Ambil Data Baru" naik ke 50 (dari 10-20). Prioritas antrian
-- tetap 3 lapis: Recycled Warm -> Recycled In Progress -> Fresh Uncalled -
-- recycled sekarang dibatasi CAP ABSOLUT PER HARI (30 Warm, 40 In
-- Progress), bukan persentase, supaya recycled tidak menghabiskan seluruh
-- batch dan fresh data tetap kebagian jatah tiap hari.

-- ---------------------------------------------------------------------
-- 1A. Kapasitas default naik ke 100, agent existing yang masih 35 ikut naik
-- ---------------------------------------------------------------------
alter table public.users
  alter column kapasitas_data set default 100;

update public.users
  set kapasitas_data = 100
  where kapasitas_data = 35 and role = 'agent';

-- ---------------------------------------------------------------------
-- 1B. Kolom tracking cap harian recycled - reset otomatis tiap hari,
-- lihat 1D (cron) dan pengecekan ganti-hari inline di 1C (RPC).
-- ---------------------------------------------------------------------
alter table public.users
  add column if not exists recycled_warm_taken_today int default 0,
  add column if not exists recycled_inprogress_taken_today int default 0,
  add column if not exists recycled_counter_date date default current_date;

-- ---------------------------------------------------------------------
-- 1C. assign_contacts_to_agent — kapasitas 100/150, batch 50, cap
-- absolut harian recycled 30 (Warm) / 40 (In Progress). Return type
-- sama seperti 0011 (TABLE(assigned_count, rejected_reason)).
--
-- CATATAN (belum divalidasi terhadap konfigurasi timezone project):
-- "ganti hari" di bawah dicek lewat current_date, yang ikut timezone
-- session Postgres (default UTC di Supabase, BUKAN WIB) - tidak ada
-- migrasi lain di project ini yang men-set timezone session. Reset cap
-- harian jadinya jatuh di tengah malam UTC (= 07:00 WIB), bukan tengah
-- malam WIB seperti yang dimaksud. Dampaknya kecil (jam 00:00-07:00 WIB
-- agent masih pakai cap "hari kemarin"), tapi kalau mau presisi WIB,
-- ganti pembanding di bawah jadi:
--   ((now() at time zone 'Asia/Jakarta')::date)
-- di setiap current_date yang berkaitan dengan reset counter (bukan yang
-- dipakai untuk default kolom). Tidak diubah di sini karena angka/logic
-- di patch ini sudah dikunci sesuai spesifikasi.
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

  -- Hitung active slots (Uncalled + In Progress + Warm)
  select count(*) into v_active_count
  from public.contacts
  where assigned_to = p_agent_id
    and status_call in ('Uncalled', 'In Progress', 'Warm');

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

-- ---------------------------------------------------------------------
-- 1D. Cron: reset counter recycled harian - backup redundan (counter
-- juga di-reset otomatis di dalam RPC saat detect ganti hari, tapi cron
-- ini pastikan reset terjadi meski agent tidak login/ambil data hari itu)
-- ---------------------------------------------------------------------
select cron.schedule(
  'reset-recycled-counter-daily',
  '0 17 * * *',  -- jam 00:00 WIB (17:00 UTC hari sebelumnya)
  $$
  update public.users
  set recycled_warm_taken_today = 0,
      recycled_inprogress_taken_today = 0,
      recycled_counter_date = current_date
  where role = 'agent';
  $$
);
