-- =====================================================================
-- 0011_agent_status_smart_queue.sql — Agent Status System + Smart Queue
-- =====================================================================
-- Agent bisa Aktif / Pause (maks 2 hari, ditahan tidak ke pool) / Nonaktif
-- (semua kontak aktif dilepas ke pool). Antrian ambil data baru sekarang
-- prioritas: Recycled Warm -> Recycled In Progress -> Fresh Uncalled.

-- ---------------------------------------------------------------------
-- 1A. Kolom status agen
-- ---------------------------------------------------------------------
alter table public.users
  add column if not exists agent_status text
    not null default 'active'
    check (agent_status in ('active', 'pause', 'inactive')),
  add column if not exists pause_started_at timestamptz,
  add column if not exists pause_reason text,
  add column if not exists pause_max_days int default 2;

-- ---------------------------------------------------------------------
-- 1B. deactivate_agent — nonaktifkan agen, lepas semua kontak aktif ke
--     pool. Closed & Invalid tetap assigned (tidak pernah dilepas).
-- ---------------------------------------------------------------------
create or replace function public.deactivate_agent(p_agent_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.users
  set
    agent_status = 'inactive',
    is_active = false,
    pause_started_at = null,
    pause_reason = null
  where id = p_agent_id;

  update public.contacts
  set
    assigned_to = null,
    assigned_at = null,
    notes = coalesce(notes, '') ||
      E'\n[Auto-release ' || now()::date ||
      ': agent dinonaktifkan]'
  where
    assigned_to = p_agent_id
    and status_call in ('Uncalled', 'In Progress', 'Warm', 'Hot Lead');
end;
$$;

-- ---------------------------------------------------------------------
-- 1C. pause_agent — data ditahan (tidak ke pool)
-- ---------------------------------------------------------------------
create or replace function public.pause_agent(
  p_agent_id uuid,
  p_reason text default 'Tidak ada keterangan'
)
returns void
language plpgsql
security definer
as $$
begin
  update public.users
  set
    agent_status = 'pause',
    pause_started_at = now(),
    pause_reason = p_reason
  where id = p_agent_id and is_active = true;
end;
$$;

-- ---------------------------------------------------------------------
-- 1D. resume_agent — aktifkan kembali dari pause (atau nonaktif)
-- ---------------------------------------------------------------------
create or replace function public.resume_agent(p_agent_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.users
  set
    agent_status = 'active',
    is_active = true,
    pause_started_at = null,
    pause_reason = null
  where id = p_agent_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 1E. Cron: auto-nonaktifkan agen yang pause > pause_max_days
--     Jalan tiap hari jam 06:00 WIB (23:00 UTC)
-- ---------------------------------------------------------------------
select cron.schedule(
  'auto-deactivate-overdue-pause',
  '0 23 * * *',
  $$
  select public.deactivate_agent(id)
  from public.users
  where
    agent_status = 'pause'
    and pause_started_at <= now() - (pause_max_days || ' days')::interval;
  $$
);

-- ---------------------------------------------------------------------
-- 1F. Cron: auto-reshuffle Warm/In Progress yang 3 hari tidak
--     ditindaklanjuti. Agent berstatus Pause dikecualikan - data mereka
--     ditahan sampai kembali aktif atau auto-nonaktif.
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
    status_call in ('Warm', 'In Progress')
    and assigned_to is not null
    and updated_at <= now() - interval '3 days'
    and assigned_to in (
      select id from public.users where agent_status = 'active'
    );
  $$
);

-- ---------------------------------------------------------------------
-- 1G. assign_contacts_to_agent — prioritas Recycled Warm -> Recycled
--     In Progress -> Fresh Uncalled. Return type tetap sama seperti
--     0010 (TABLE(assigned_count, rejected_reason)), jadi CREATE OR
--     REPLACE langsung bisa tanpa DROP FUNCTION.
-- ---------------------------------------------------------------------
create or replace function public.assign_contacts_to_agent(
  p_agent_id uuid,
  p_batch_size int default 15
)
returns table(assigned_count int, rejected_reason text)
language plpgsql
security definer
as $$
declare
  v_kapasitas      int;
  v_agent_status   text;
  v_active_count   int;
  v_available      int;
  v_actual_batch   int;
  v_assigned_total int := 0;
  v_warm_ids       uuid[];
  v_inprog_ids     uuid[];
  v_fresh_ids      uuid[];
  v_warm_limit     int := 5;
  v_inprog_limit   int := 5;
begin
  select kapasitas_data, agent_status
  into v_kapasitas, v_agent_status
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

  select count(*) into v_active_count
  from public.contacts
  where assigned_to = p_agent_id
    and status_call in ('Uncalled', 'In Progress', 'Warm');

  if v_active_count >= 70 then
    return query select 0,
      'Batas maksimum sistem tercapai (70 kontak aktif). ' ||
      'Selesaikan kontak yang ada dulu.';
    return;
  end if;

  v_available := least(v_kapasitas, 70) - v_active_count;

  if v_available <= 0 then
    return query select 0,
      'Antrean aktif penuh (' || v_active_count ||
      ' dari ' || v_kapasitas || '). Selesaikan kontak yang ada dulu.';
    return;
  end if;

  v_actual_batch := least(p_batch_size, v_available, 20);

  -- PRIORITAS 1: Recycled Warm (max 5)
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
    limit least(v_warm_limit, v_actual_batch)
    for update skip locked
  ) sub;

  if v_warm_ids is not null then
    update public.contacts
    set assigned_to = p_agent_id, assigned_at = now()
    where id = any(v_warm_ids);
    v_assigned_total := array_length(v_warm_ids, 1);
  end if;

  -- PRIORITAS 2: Recycled In Progress (max 5, sisa slot)
  if v_assigned_total < v_actual_batch then
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
      limit least(v_inprog_limit, v_actual_batch - v_assigned_total)
      for update skip locked
    ) sub;

    if v_inprog_ids is not null then
      update public.contacts
      set assigned_to = p_agent_id, assigned_at = now()
      where id = any(v_inprog_ids);
      v_assigned_total := v_assigned_total + array_length(v_inprog_ids, 1);
    end if;
  end if;

  -- PRIORITAS 3: Fresh Uncalled (sisa slot)
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
