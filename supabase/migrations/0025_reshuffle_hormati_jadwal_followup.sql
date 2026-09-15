-- =====================================================================
-- 0025_reshuffle_hormati_jadwal_followup.sql — cron auto-reshuffle tidak
-- lagi melepas kontak yang follow-up-nya masih dijadwalkan di masa depan.
-- =====================================================================
--
-- MASALAH:
-- Cron 'auto-reshuffle-overdue-followup' (dibuat 0011, diperbarui 0018)
-- melepas kontak Warm/In Progress/Inbound begitu updated_at-nya lebih dari
-- 3 hari, TANPA memeriksa next_follow_up_at sama sekali. Akibatnya agen
-- yang menjadwalkan follow-up dengan benar — dan (dengan benar juga) tidak
-- menyentuh kontak itu lagi sampai hari H yang dijanjikan — malah
-- kehilangan lead itu sebelum janjinya tiba, cuma karena sudah lebih dari
-- 3 hari sejak terakhir disentuh.
--
-- Kejadian nyata: 11 lead Warm milik Freya (dijadwalkan follow-up 9-11
-- September 2026) dicabut cron ini, lalu terlanjur diambil agen lain lewat
-- tombol "Ambil Data Baru" (prioritas Recycled Warm di
-- assign_contacts_to_agent(), lihat 0014).
--
-- PERBAIKAN:
-- Tambah satu syarat di klausa WHERE: kontak yang next_follow_up_at-nya
-- MASIH DI MASA DEPAN tidak ikut dilepas, apa pun umur updated_at-nya.
-- Kontak yang tidak punya jadwal follow-up sama sekali (next_follow_up_at
-- null), atau jadwalnya sudah lewat, tetap dilepas seperti semula — cuma
-- kontak dengan janji follow-up yang genuinely belum jatuh tempo yang
-- sekarang dikecualikan.
--
-- CATATAN: perbaikan ini SUDAH DIJALANKAN MANUAL di database produksi
-- tanggal 16 September 2026. File migrasi ini dibuat setelahnya, supaya
-- riwayat migrasi di repo mencerminkan keadaan database yang sebenarnya
-- — bukan untuk pertama kali menerapkan perubahan ini.
--
-- Aman dijalankan ulang: cron.schedule() dengan nama job yang sudah ada
-- meng-upsert definisinya (bukan membuat duplikat, lihat komentar di
-- bawah), jadi kalau suatu saat seluruh rangkaian migrasi dijalankan dari
-- awal di database baru (mis. setup ulang/replika), file ini akan
-- otomatis ikut terpasang ulang secara idempoten dan itu aman — tidak
-- ada efek samping dari menjalankannya lebih dari satu kali.
-- =====================================================================

-- ---------------------------------------------------------------------
-- cron.schedule dengan nama yang sudah ada akan menggantikan definisi job
-- itu (upsert bawaan pg_cron), bukan membuat duplikat - sama seperti pola
-- yang sudah dipakai 0018 untuk job yang sama.
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
    and (next_follow_up_at is null or next_follow_up_at <= now())
    and assigned_to in (
      select id from public.users where agent_status = 'active'
    );
  $$
);

-- =====================================================================
-- ROLLBACK - kalau migrasi ini perlu dibatalkan, salin blok di bawah ini
-- (hapus tanda komentar "-- " di setiap barisnya) ke Supabase SQL Editor
-- dan jalankan. Ini definisi cron 'auto-reshuffle-overdue-followup' versi
-- 0018 apa adanya (persis sebelum migrasi ini), supaya bisa dikembalikan
-- dalam hitungan detik kalau ada masalah.
-- =====================================================================
--
-- select cron.schedule(
--   'auto-reshuffle-overdue-followup',
--   '0 23 * * *',
--   $$
--   update public.contacts
--   set
--     assigned_to = null,
--     assigned_at = null,
--     notes = coalesce(notes, '') ||
--       E'\n[Auto-reshuffle ' || now()::date ||
--       ': follow-up tidak ditindaklanjuti 3 hari]'
--   where
--     status_call in ('Warm', 'In Progress', 'Inbound')
--     and assigned_to is not null
--     and updated_at <= now() - interval '3 days'
--     and assigned_to in (
--       select id from public.users where agent_status = 'active'
--     );
--   $$
-- );
