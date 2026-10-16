-- =====================================================================
-- ROLLBACK untuk 0030_pisah_rating_pekerjaan_status_kontrak.sql
-- =====================================================================
-- BUKAN migrasi: jangan taruh di supabase/migrations. Dijalankan MANUAL di
-- Supabase SQL Editor kalau 0030 perlu dibatalkan.
--
-- notes tidak pernah diubah oleh 0030, jadi data asli tidak hilang -
-- rollback hanya membersihkan kolom baru:
--   1. rating/pekerjaan yang diisi BACKFILL dikosongkan (hanya yang
--      nilainya masih sama dengan cadangan; nilai yang dipasang impor
--      CSV setelah 0030, atau diedit manual, TIDAK disentuh).
--   2. CHECK baru status kontrak dibuang.
-- Trigger updated_at dimatikan hanya di dalam blok langkah 1 (atomik),
-- supaya updated_at ~3.400 baris tidak ikut berubah.
--
-- YANG SENGAJA TIDAK DILAKUKAN:
--   - Kolom rating/pekerjaan TIDAK di-drop (langkah opsional di bawah
--     MENGHAPUS data impor setelah 0030).
--   - CHECK lama ('Lunas','Masih Kredit','Tidak Tahu') TIDAK dipasang
--     lagi: kolom itu tidak pernah terisi sebelum 0030, dan kalau sudah
--     ada baris RRD/ICP/EXP/LIV dari impor, CHECK lama akan membuat
--     UPDATE APA PUN pada baris itu (termasuk simpan call log) gagal.
--     Pasang lagi hanya setelah nilainya dikosongkan - lihat opsional.
--   - Dua kunci system_config dibiarkan (tidak dipakai apa pun).
-- =====================================================================

-- 0. Periksa dulu.
-- select
--   (select count(*) from public.backup_pisah_notes_0030)                          as baris_cadangan,
--   (select count(*) from public.contacts where rating is not null)               as rating_terisi,
--   (select count(*) from public.contacts where pekerjaan is not null)            as pekerjaan_terisi,
--   (select count(*) from public.contacts where status_kredit_kendaraan is not null) as status_kontrak_terisi;

-- 1. Kosongkan hasil backfill (atomik, termasuk status trigger).
do $rollback$
declare
  v_rating    integer;
  v_pekerjaan integer;
begin
  if to_regclass('public.backup_pisah_notes_0030') is null then
    raise exception 'Rollback 0030 dihentikan: tabel cadangan public.backup_pisah_notes_0030 tidak ada. Tidak ada yang diubah.';
  end if;

  alter table public.contacts disable trigger contacts_updated_at;

  with ubah as (
    update public.contacts c
    set rating    = case when c.rating = b.rating then null else c.rating end,
        pekerjaan = case when c.pekerjaan = b.pekerjaan then null else c.pekerjaan end
    from public.backup_pisah_notes_0030 b
    where c.id = b.contact_id
    returning b.rating as rating_cadangan, b.pekerjaan as pekerjaan_cadangan
  )
  select count(rating_cadangan), count(pekerjaan_cadangan)
    into v_rating, v_pekerjaan
  from ubah;

  alter table public.contacts enable trigger contacts_updated_at;

  raise notice 'Rollback 0030: diproses % cadangan rating dan % cadangan pekerjaan.', v_rating, v_pekerjaan;
end;
$rollback$;

-- 2. Buang CHECK baru status kontrak.
alter table public.contacts drop constraint if exists contacts_status_kontrak_check;

-- ---------------------------------------------------------------------
-- OPSIONAL (destruktif - pikirkan dulu):
-- ---------------------------------------------------------------------
-- Kosongkan status kontrak lalu pasang kembali CHECK lama dari 0001:
-- update public.contacts set status_kredit_kendaraan = null
--  where status_kredit_kendaraan in ('RRD','ICP','EXP','LIV');
-- alter table public.contacts add constraint contacts_status_kredit_kendaraan_check
--   check (status_kredit_kendaraan in ('Lunas','Masih Kredit','Tidak Tahu'));
--
-- Hapus kolom (HILANG: semua pekerjaan/rating hasil impor setelah 0030):
-- alter table public.contacts drop column if exists rating;
-- alter table public.contacts drop column if exists pekerjaan;
--
-- Hapus kunci config dan tabel cadangan (tabel cadangan sebaiknya
-- dipertahankan sebagai arsip audit):
-- delete from public.system_config where key in ('prioritas_rating', 'prioritas_kontrak');
-- drop table if exists public.backup_pisah_notes_0030;
