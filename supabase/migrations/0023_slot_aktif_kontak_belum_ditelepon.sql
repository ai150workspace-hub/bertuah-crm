-- =====================================================================
-- 0023_slot_aktif_kontak_belum_ditelepon.sql — kontak yang belum pernah
-- ditelepon ikut dihitung slot aktif, bukan cuma yang follow-up-nya jatuh
-- tempo hari ini.
-- =====================================================================
--
-- MASALAH:
-- public.is_contact_active_today() (0022_active_slot_today_only.sql)
-- menghitung kontak 'In Progress'/'Warm' sebagai slot aktif HANYA kalau
-- last_contacted_at = hari ini ATAU next_follow_up_at sudah jatuh tempo.
--
-- Tapi assign_contacts_atomic() (0018_inbound_release_safety_net.sql)
-- menaikkan kontak 'Uncalled'/'Inbound' menjadi 'In Progress' begitu admin
-- meng-assign manual - padahal kontak itu BELUM PERNAH ditelepon, jadi
-- last_contacted_at DAN next_follow_up_at-nya sama-sama NULL. Kedua syarat
-- di atas jadi false, dan kontak itu TIDAK terhitung mengisi slot aktif
-- sama sekali. Agen bisa diberi ratusan kontak lewat assign manual dan
-- tombol "Ambil Data Baru" tetap terbuka penuh, seolah-olah agen itu belum
-- punya kerjaan apa-apa.
--
-- Catatan di bagian akhir 0018 menyatakan kontak Inbound "otomatis
-- terhitung" setelah perbaikan di situ - pernyataan itu benar SAAT DITULIS
-- (definisi slot aktif waktu itu berbasis status_call saja, sebelum 0022
-- ada), tapi jadi tidak berlaku lagi setelah 0022 mengubah definisinya jadi
-- berbasis tanggal. Migrasi ini yang menutup celah itu. 'Inbound' juga
-- belum ada sama sekali di daftar status is_contact_active_today() -
-- ditambahkan di sini sebagai jaring pengaman kedua (lihat catatan 0018
-- soal kontak Inbound yang di-assign SEBELUM migrasi itu ada, dan belum
-- pernah disentuh ulang).
--
-- PERBAIKAN:
-- Tambahkan kondisi `p_last_contacted_at is null` sebagai salah satu syarat
-- yang membuat kontak dihitung aktif, dan tambahkan 'Inbound' ke daftar
-- status yang diperiksa. Logikanya: kontak yang BELUM PERNAH ditelepon
-- adalah pekerjaan yang belum dikerjakan - sama persis dengan 'Uncalled',
-- yang memang selalu dihitung aktif tanpa syarat tanggal apa pun.
--
-- DAMPAK SAAT DIJALANKAN: nol perubahan pada angka siapa pun. Saat migrasi
-- ini dibuat, jumlah kontak berstatus In Progress/Warm dengan
-- last_contacted_at IS NULL di produksi = 0, dan jumlah kontak Inbound yang
-- sedang ter-assign ke agen manapun = 0. Migrasi ini murni pencegahan untuk
-- assign manual admin di masa depan (penambahan agen ke-2 dan seterusnya),
-- bukan perbaikan atas sesuatu yang sedang salah hitung sekarang.
-- =====================================================================

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
      p_status_call in ('In Progress', 'Warm', 'Inbound')
      and (
        p_last_contacted_at is null
        or coalesce(
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
  'selalu aktif; In Progress/Warm/Inbound dihitung aktif kalau BELUM PERNAH '
  'ditelepon (last_contacted_at null - termasuk kontak yang baru di-assign '
  'admin dari Uncalled/Inbound, lihat 0018_inbound_release_safety_net.sql), '
  'atau terakhir dihubungi hari ini, atau follow-up-nya jatuh tempo hari '
  'ini/terlambat. Lihat migrasi 0023_slot_aktif_kontak_belum_ditelepon.sql.';

-- =====================================================================
-- ROLLBACK - kalau migrasi ini perlu dibatalkan, salin blok di bawah ini
-- (hapus tanda komentar "-- " di setiap barisnya) ke Supabase SQL Editor
-- dan jalankan. Ini definisi is_contact_active_today() versi 0022 apa
-- adanya (persis sebelum migrasi ini), supaya bisa dikembalikan dalam
-- hitungan detik kalau ada masalah.
-- =====================================================================
--
-- create or replace function public.is_contact_active_today(
--   p_status_call       text,
--   p_last_contacted_at timestamptz,
--   p_next_follow_up_at timestamptz
-- )
-- returns boolean
-- language sql
-- stable
-- as $$
--   select
--     p_status_call = 'Uncalled'
--     or (
--       p_status_call in ('In Progress', 'Warm')
--       and (
--         coalesce(
--           (p_last_contacted_at + interval '7 hours')::date = (now() + interval '7 hours')::date,
--           false
--         )
--         or coalesce(
--           (p_next_follow_up_at + interval '7 hours')::date <= (now() + interval '7 hours')::date,
--           false
--         )
--       )
--     )
-- $$;
--
-- comment on function public.is_contact_active_today is
--   'Satu-satunya definisi "kontak dihitung slot aktif hari ini" - Uncalled '
--   'selalu aktif; In Progress/Warm cuma aktif kalau terakhir dihubungi hari '
--   'ini atau follow-up-nya jatuh tempo hari ini/terlambat. Lihat migrasi '
--   '0022_active_slot_today_only.sql.';
