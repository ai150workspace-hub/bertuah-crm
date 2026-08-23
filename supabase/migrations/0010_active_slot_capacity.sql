-- =====================================================================
-- 0010_active_slot_capacity.sql — Active Slot System untuk kapasitas agent
-- =====================================================================
-- Slot aktif = Uncalled + In Progress + Warm saja. Hot Lead (sudah masuk
-- pipeline aplikasi), Closed (selesai), dan Invalid (nomor mati/salah)
-- tidak lagi memakan kapasitas.
--
-- Default kapasitas_data: 50 -> 35. Hard ceiling 70 (tidak bisa dilewati
-- siapapun, termasuk admin assign manual).

-- ---------------------------------------------------------------------
-- 1. Default kapasitas_data
-- ---------------------------------------------------------------------
alter table public.users
  alter column kapasitas_data set default 35;

update public.users
  set kapasitas_data = 35
  where kapasitas_data = 50 and role = 'agent';

-- ---------------------------------------------------------------------
-- 2. assign_contacts_to_agent — return type berubah (setof contacts ->
--    TABLE(assigned_count, rejected_reason)), jadi DROP dulu sebelum
--    CREATE OR REPLACE (Postgres menolak ganti return type function
--    yang sudah ada lewat CREATE OR REPLACE begitu saja).
-- ---------------------------------------------------------------------
drop function if exists public.assign_contacts_to_agent(uuid, int);

create or replace function public.assign_contacts_to_agent(
  p_agent_id uuid,
  p_batch_size int default 15
)
returns table(assigned_count int, rejected_reason text)
language plpgsql
security definer
as $$
declare
  v_kapasitas    int;
  v_active_count int;
  v_available    int;
  v_actual_batch int;
  v_contact_ids  uuid[];
  v_agent_name   text;
begin
  -- Ambil kapasitas dan nama agent
  select kapasitas_data, name into v_kapasitas, v_agent_name
  from public.users
  where id = p_agent_id and is_active = true;

  if not found then
    return query select 0, 'Agent tidak ditemukan atau tidak aktif';
    return;
  end if;

  -- Hitung ACTIVE SLOTS saja (Uncalled + In Progress + Warm)
  -- Invalid, Hot Lead, Closed tidak dihitung
  select count(*) into v_active_count
  from public.contacts
  where assigned_to = p_agent_id
    and status_call in ('Uncalled', 'In Progress', 'Warm');

  -- Hitung slot tersisa
  v_available := v_kapasitas - v_active_count;

  -- Hard ceiling 70 — tidak bisa dilewati siapapun
  if v_active_count >= 70 then
    return query select 0,
      'Batas maksimum sistem tercapai (70 kontak aktif). ' ||
      'Selesaikan kontak yang ada dulu.';
    return;
  end if;

  -- Pastikan tidak melebihi hard ceiling
  v_available := least(v_available, 70 - v_active_count);

  if v_available <= 0 then
    return query select 0,
      'Antrean ' || v_agent_name || ' penuh (' ||
      v_active_count || ' aktif dari ' || v_kapasitas ||
      ' kapasitas). Selesaikan kontak yang ada dulu.';
    return;
  end if;

  -- Clamp ke max 20 per klik
  v_actual_batch := least(p_batch_size, v_available, 20);

  -- Lock dan assign dengan SKIP LOCKED (cegah race condition)
  select array_agg(id) into v_contact_ids
  from (
    select id from public.contacts
    where status_call = 'Uncalled'
      and assigned_to is null
    order by created_at asc
    limit v_actual_batch
    for update skip locked
  ) sub;

  if v_contact_ids is null or array_length(v_contact_ids, 1) = 0 then
    return query select 0,
      'Tidak ada data baru tersedia di pool saat ini.';
    return;
  end if;

  update public.contacts
  set assigned_to = p_agent_id,
      assigned_at = now()
  where id = any(v_contact_ids);

  return query
    select array_length(v_contact_ids, 1), null::text;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Helper: cek active slots — dipakai admin assign manual dan UI agent
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
    and status_call in ('Uncalled', 'In Progress', 'Warm');

  return query select
    v_active,
    v_kapasitas,
    greatest(0, least(v_kapasitas, 70) - v_active),
    v_active >= least(v_kapasitas, 70);
end;
$$;
