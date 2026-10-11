-- =====================================================================
-- ROLLBACK untuk 0028_status_tidak_terjangkau.sql
-- =====================================================================
-- BUKAN migrasi: jangan taruh di supabase/migrations. Dijalankan MANUAL di
-- Supabase SQL Editor kalau 0028 perlu dibatalkan. Urutan penting.
--
-- Mengembalikan kontak yang ditandai tag HABIS_3X (status 'Tidak
-- Terjangkau') ke 'In Progress', dan memulihkan assigned_to dari catatan di
-- notes ("assigned_to lama=<uuid>") kalau agennya masih ada. Catatan
-- HABIS_3X di notes sengaja DIBIARKAN sebagai jejak audit.
--
-- Catatan: kontak yang sudah ditandai ulang manual / berubah status setelah
-- 0028 tidak disentuh (syarat: masih 'Tidak Terjangkau' DAN bertag HABIS_3X).
-- =====================================================================

-- 0. (Opsional, dulu) lihat dulu apa yang akan dikembalikan:
-- select count(*) from public.contacts
-- where status_call = 'Tidak Terjangkau' and tags @> '{HABIS_3X}';

-- 1. Kembalikan kontak.
update public.contacts c
set
  status_call = 'In Progress',
  tags = array_remove(c.tags, 'HABIS_3X'),
  assigned_to = r.assigned_lama,
  assigned_at = case when r.assigned_lama is not null then now() else null end
from (
  select
    c2.id,
    (
      select u.id
      from public.users u
      where u.id::text = substring(c2.notes from 'assigned_to lama=([0-9a-fA-F-]{36})')
    ) as assigned_lama
  from public.contacts c2
  where c2.status_call = 'Tidak Terjangkau'
    and c2.tags @> '{HABIS_3X}'
) r
where c.id = r.id;

-- 2. Cron kembali ke definisi 0027 (tanpa langkah tandai_tidak_terjangkau).
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

-- 3. (Opsional) hapus fungsi dan status baru dari constraint. HANYA setelah
--    langkah 1 selesai - constraint tidak akan lolos kalau masih ada baris
--    berstatus 'Tidak Terjangkau'.
-- drop function if exists public.tandai_tidak_terjangkau();
-- alter table public.contacts drop constraint if exists contacts_status_call_check;
-- alter table public.contacts add constraint contacts_status_call_check
--   check (status_call in (
--     'Uncalled','In Progress','Contacted','Hot Lead','Warm',
--     'Closed','Submitted','Rejected','Invalid','Duplicate',
--     'Inbound'
--   ));
