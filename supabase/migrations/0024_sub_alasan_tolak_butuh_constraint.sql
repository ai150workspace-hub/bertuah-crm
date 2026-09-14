-- =====================================================================
-- 0024_sub_alasan_tolak_butuh_constraint.sql — izinkan sub_alasan untuk
-- hasil TOLAK_BUTUH di level DATABASE, bukan cuma di validasi aplikasi.
-- =====================================================================
--
-- MASALAH:
-- Fitur sub-alasan TOLAK_BUTUH (lib/call-outcome/catalog.ts:
-- SUB_ALASAN_TOLAK_BUTUH, 5 kode baru) sudah benar di sisi aplikasi -
-- tapi DUA constraint di database (dibuat 0003_call_outcome_datar.sql,
-- sebelum fitur ini ada) belum ikut diperbarui:
--
--   1. call_logs_sub_alasan_check - daftar putih nilai sub_alasan yang
--      diizinkan, masih cuma berisi 7 kode lama untuk TIDAK_MEMENUHI_SYARAT.
--   2. call_logs_sub_alasan_konsisten - secara eksplisit MEWAJIBKAN
--      sub_alasan NULL untuk semua hasil selain TIDAK_MEMENUHI_SYARAT.
--
-- Akibatnya: agen yang pilih hasil TOLAK_BUTUH + sub-alasan baru (misal
-- REFLEKS) tidak bisa menyimpan call log sama sekali - PostgreSQL menolak
-- dengan "violates check constraint call_logs_sub_alasan_check", walau
-- validasi di aplikasi sudah lolos. Ditemukan dari kegagalan simpan
-- sungguhan di produksi (agen aktif mencoba menyimpan call log nyata).
--
-- PERBAIKAN:
-- Drop lalu buat ulang kedua constraint supaya:
--   1. sub_alasan boleh salah satu dari 7 kode TIDAK_MEMENUHI_SYARAT ATAU
--      5 kode TOLAK_BUTUH.
--   2. sub_alasan wajib diisi untuk TIDAK_MEMENUHI_SYARAT *dan* TOLAK_BUTUH,
--      wajib NULL untuk hasil lainnya - persis mencerminkan
--      lib/call-outcome/catalog.ts (wajib: ['sub_alasan'] cuma di 2 kode itu).
--
-- DATA LAMA: constraint #2 ditambahkan sebagai NOT VALID dan SENGAJA TIDAK
-- divalidasi (tidak ada `validate constraint` di bawah) - baris TOLAK_BUTUH
-- lama yang sub_alasan-nya NULL harus tetap seperti itu, tidak boleh
-- diminta backfill (sesuai instruksi sebelumnya). NOT VALID tanpa validasi
-- berarti baris lama itu dibiarkan permanen, constraint cuma berlaku untuk
-- baris baru ke depannya. Constraint #1 aman divalidasi langsung (tanpa
-- NOT VALID) karena NULL selalu lolos cek IN (...) di PostgreSQL - baris
-- lama sub_alasan=NULL itu tidak pernah melanggar constraint #1.
-- =====================================================================

alter table public.call_logs
  drop constraint if exists call_logs_sub_alasan_check;

alter table public.call_logs
  add constraint call_logs_sub_alasan_check check (
    sub_alasan in (
      -- TIDAK_MEMENUHI_SYARAT (SUB_ALASAN_TIDAK_LAYAK)
      'BPKB_MASIH_KREDIT','BPKB_BUKAN_ATAS_NAMA','PAJAK_MATI',
      'UNIT_TERLALU_TUA','LUAR_COVERAGE','RIWAYAT_KREDIT','LAINNYA',
      -- TOLAK_BUTUH (SUB_ALASAN_TOLAK_BUTUH)
      'REFLEKS','SUDAH_DAPAT_DANA','BELUM_PERLU','ANTI_UTANG','SETELAH_PENAWARAN'
    )
  );

alter table public.call_logs
  drop constraint if exists call_logs_sub_alasan_konsisten;

alter table public.call_logs
  add constraint call_logs_sub_alasan_konsisten check (
    (hasil in ('TIDAK_MEMENUHI_SYARAT', 'TOLAK_BUTUH') and sub_alasan is not null)
    or (hasil not in ('TIDAK_MEMENUHI_SYARAT', 'TOLAK_BUTUH') and sub_alasan is null)
    or hasil is null
  ) not valid;

comment on column public.call_logs.sub_alasan is
  'Untuk hasil=TIDAK_MEMENUHI_SYARAT (7 kode, ukur mutu database) dan '
  'hasil=TOLAK_BUTUH (5 kode, bedakan tolak reflek vs tolak setelah dengar '
  'penawaran - lihat 0024_sub_alasan_tolak_butuh_constraint.sql). NULL '
  'untuk hasil lainnya.';
