-- =====================================================================
-- ROLLBACK untuk 0028_status_tidak_terjangkau.sql
-- =====================================================================
-- BUKAN migrasi: jangan taruh di supabase/migrations. Dijalankan MANUAL di
-- Supabase SQL Editor kalau 0028 perlu dibatalkan. Urutan penting.
--
-- Membaca keadaan lama dari public.backup_habis3x (diisi oleh
-- public.tandai_tidak_terjangkau() setiap kali memindahkan kontak -
-- backfill DAN cron harian). Mengembalikan status_call, assigned_to, dan
-- assigned_at persis seperti sebelum dipindah, lalu menghapus tag
-- HABIS_3X. Catatan HABIS_3X di notes sengaja DIBIARKAN sebagai jejak.
--
-- Hanya menyentuh kontak yang MASIH 'Tidak Terjangkau' dan bertag
-- HABIS_3X. Kalau sebuah kontak pernah dipindah lebih dari sekali, baris
-- cadangan TERBARU yang dipakai. Kalau agen lamanya sudah tidak ada di
-- public.users, assigned_to dibiarkan kosong (kontak kembali ke pool).
-- =====================================================================

-- 0. Periksa dulu. Dua angka ini HARUS sama; kalau beda, ada kontak
--    ber-tag HABIS_3X tanpa cadangan - JANGAN lanjut sebelum dicek.
-- select
--   (select count(*) from public.contacts
--     where status_call = 'Tidak Terjangkau' and tags @> '{HABIS_3X}') as akan_dikembalikan,
--   (select count(distinct b.contact_id)
--      from public.backup_habis3x b
--      join public.contacts c on c.id = b.contact_id
--     where c.status_call = 'Tidak Terjangkau' and c.tags @> '{HABIS_3X}') as punya_cadangan;

-- 1. Kembalikan kontak.
update public.contacts c
set
  status_call = b.status_call_lama,
  assigned_to = case
    when exists (select 1 from public.users u where u.id = b.assigned_to_lama)
    then b.assigned_to_lama
  end,
  assigned_at = case
    when exists (select 1 from public.users u where u.id = b.assigned_to_lama)
    then b.assigned_at_lama
  end,
  tags = array_remove(c.tags, 'HABIS_3X')
from (
  select distinct on (contact_id)
    contact_id, status_call_lama, assigned_to_lama, assigned_at_lama
  from public.backup_habis3x
  order by contact_id, dipindah_at desc, id desc
) b
where c.id = b.contact_id
  and c.status_call = 'Tidak Terjangkau'
  and c.tags @> '{HABIS_3X}';

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

-- 3. (Opsional) bersihkan. HANYA setelah langkah 1 selesai dan terverifikasi
--    - constraint tidak akan lolos kalau masih ada baris 'Tidak Terjangkau'.
--    Tabel cadangan SEBAIKNYA dipertahankan sebagai arsip audit.
-- drop function if exists public.tandai_tidak_terjangkau();
-- alter table public.contacts drop constraint if exists contacts_status_call_check;
-- alter table public.contacts add constraint contacts_status_call_check
--   check (status_call in (
--     'Uncalled','In Progress','Contacted','Hot Lead','Warm',
--     'Closed','Submitted','Rejected','Invalid','Duplicate',
--     'Inbound'
--   ));
-- drop table if exists public.backup_habis3x;
