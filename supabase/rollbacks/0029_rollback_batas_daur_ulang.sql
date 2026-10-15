-- =====================================================================
-- ROLLBACK untuk 0029_batas_daur_ulang_system_config.sql
-- =====================================================================
-- BUKAN migrasi: jangan taruh di supabase/migrations. Dijalankan MANUAL di
-- Supabase SQL Editor kalau 0029 perlu dibatalkan.
--
-- Mengembalikan assign_contacts_to_agent() ke definisi yang berjalan di
-- produksi TEPAT SEBELUM 0029 - disimpan 0029 sendiri di
-- public.backup_fungsi_definisi (hasil pg_get_functiondef saat migrasi
-- dijalankan, bukan salinan dari file 0027).
--
-- SEBELUM menjalankan: periksa dulu cadangannya ada dan terbaca.
--   select id, migrasi, disimpan_at, length(definisi) as panjang,
--          position('v_inprog_daily_cap' in definisi) > 0 as memuat_cap
--   from public.backup_fungsi_definisi
--   where fungsi = 'public.assign_contacts_to_agent(uuid,integer)'
--   order by id desc;
--
-- Dua kunci system_config SENGAJA dibiarkan (tidak berbahaya: fungsi lama
-- tidak membacanya; fungsi baru kalau dipasang ulang memakainya).
-- =====================================================================

do $rollback$
declare
  v_def text;
begin
  select definisi into v_def
  from public.backup_fungsi_definisi
  where fungsi = 'public.assign_contacts_to_agent(uuid,integer)'
    and migrasi = '0029'
  order by id desc
  limit 1;

  if v_def is null then
    raise exception 'Rollback 0029 dihentikan: tidak ada cadangan definisi di public.backup_fungsi_definisi (migrasi 0029). Tidak ada yang diubah.';
  end if;

  if position('recycled_warm_daily_cap' in v_def) > 0 then
    raise exception 'Rollback 0029 dihentikan: cadangan ternyata sudah memuat pembacaan system_config (bukan definisi sebelum 0029). Tidak ada yang diubah.';
  end if;

  execute v_def;

  raise notice 'Rollback 0029: assign_contacts_to_agent() dikembalikan ke definisi sebelum 0029.';
end;
$rollback$;

-- Verifikasi: harus false (fungsi tidak lagi membaca system_config).
-- select position('recycled_warm_daily_cap' in
--        pg_get_functiondef('public.assign_contacts_to_agent(uuid,integer)'::regprocedure)) > 0
--        as masih_membaca_system_config;

-- (Opsional) hapus kunci dan tabel cadangan - tabel cadangan SEBAIKNYA
-- dipertahankan sebagai arsip audit.
-- delete from public.system_config
--  where key in ('recycled_warm_daily_cap', 'recycled_inprogress_daily_cap');
-- drop table if exists public.backup_fungsi_definisi;
