-- =====================================================================
-- 0020_restricted_admin.sql — Admin "monitoring" dengan akses dibatasi.
-- =====================================================================
-- is_restricted_admin: admin yang cuma bisa lihat (monitoring), tidak
-- bisa akses halaman Import Data dan tombol Export (CSV/Excel) di
-- Dashboard, Agents & Insentif. Bukan role baru (tetap role='admin',
-- RLS/is_admin() tidak berubah) - pembatasannya di level APLIKASI
-- (halaman + 1 server action import), bukan level RLS, karena
-- scope-nya spesifik ke 2 fitur ini saja, bukan pembatasan data mana
-- yang boleh dibaca/ditulis.

alter table public.users
  add column if not exists is_restricted_admin boolean not null default false;
