-- =====================================================================
-- 0018_inbound_release_safety_net.sql
--
-- Ditemukan saat mengintegrasikan lead web (status_call = 'Inbound',
-- migrasi 0012): deactivate_agent() dan cron auto-reshuffle (0011)
-- melepas kontak balik ke pool berdasarkan daftar status_call yang
-- TIDAK memuat 'Inbound'. Kalau admin meng-assign lead Inbound ke agen
-- tanpa mengubah status_call-nya, lead itu nyangkut permanen di agen
-- itu — tidak pernah dilepas otomatis walau agennya dinonaktifkan atau
-- lead-nya tidak ditindaklanjuti berhari-hari.
--
-- Dua lapis perbaikan:
--   1. AKAR MASALAH: assign_contacts_atomic() — satu update atomik yang
--      mengubah assigned_to DAN status_call bersamaan. Kontak yang masih
--      'Uncalled'/'Inbound' (belum pernah disentuh) naik jadi
--      'In Progress' begitu di-assign, sehingga otomatis masuk daftar
--      yang dikenali deactivate_agent()/cron. status_call lain (Warm,
--      Hot Lead, dst) TIDAK diubah — assign ulang tidak boleh
--      menghapus sinyal itu.
--   2. JARING PENGAMAN: 'Inbound' ditambahkan ke daftar status yang
--      dilepas deactivate_agent() dan cron auto-reshuffle, untuk kasus
--      yang lolos dari perbaikan #1 (mis. data lama sebelum migrasi ini).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Assign atomik — assigned_to + status_call dalam satu statement.
-- ---------------------------------------------------------------------
create or replace function public.assign_contacts_atomic(
  p_contact_ids uuid[],
  p_agent_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contacts
  set
    assigned_to = p_agent_id,
    assigned_at = now(),
    status_call = case
      when status_call in ('Uncalled', 'Inbound') then 'In Progress'
      else status_call
    end
  where id = any(p_contact_ids);
end;
$$;

revoke all on function public.assign_contacts_atomic(uuid[], uuid) from public, anon;

comment on function public.assign_contacts_atomic is
  'Dipakai app/actions/contacts.ts:assignContacts() menggantikan update() '
  'langsung — supaya status_call ikut naik ke In Progress saat assign, '
  'bukan cuma assigned_to. Lihat migrasi 0018.';

-- ---------------------------------------------------------------------
-- 2. Jaring pengaman — deactivate_agent() ikut melepas 'Inbound'.
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
    and status_call in ('Uncalled', 'In Progress', 'Warm', 'Hot Lead', 'Inbound');
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Jaring pengaman — cron auto-reshuffle ikut melepas 'Inbound'.
--    cron.schedule dengan nama yang sudah ada akan menggantikan
--    definisi job itu (upsert bawaan pg_cron), bukan membuat duplikat.
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
    and assigned_to in (
      select id from public.users where agent_status = 'active'
    );
  $$
);

-- ---------------------------------------------------------------------
-- Catatan untuk migrasi terpisah (BUKAN bagian dari fix ini): fungsi
-- get_agent_active_slots() di 0010 menghitung slot aktif dengan
-- status_call in ('Uncalled','In Progress','Warm') — juga tidak memuat
-- 'Inbound'. Begitu perbaikan #1 di atas berjalan, kontak Inbound yang
-- baru di-assign langsung naik ke 'In Progress' sehingga otomatis
-- terhitung. Yang masih berpotensi lolos hitungan: kontak Inbound yang
-- di-assign SEBELUM migrasi ini ada, dan belum pernah disentuh ulang.
-- Perlu dicek terpisah kalau ingin ditutup juga.
