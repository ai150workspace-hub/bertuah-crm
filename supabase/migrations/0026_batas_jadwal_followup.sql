-- =====================================================================
-- 0026_batas_jadwal_followup.sql — batasi jadwal follow-up maksimal 7 hari
-- ke depan, kecuali agen mengisi alasan.
-- =====================================================================
--
-- TUJUAN:
-- Follow-up yang dijadwalkan terlalu jauh ke depan gampang terlupakan dan
-- bikin funnel susah dipercaya. Aturan barunya: normalnya maksimal 7 hari,
-- tapi lebih dari itu tetap boleh SELAMA agen menulis alasannya - supaya
-- pengecualian yang genuinely valid (nasabah minta dihubungi lagi setelah
-- gajian, dst.) tetap bisa dicatat, dan admin bisa melihat daftarnya untuk
-- dilaporkan (lihat components/admin/JadwalJauhCard.tsx).
--
-- KENAPA VALIDASINYA DIBATASI KETAT KE PERUBAHAN next_follow_up_at SAJA:
-- Tabel contacts di-UPDATE oleh banyak proses yang TIDAK ADA hubungannya
-- dengan penjadwalan follow-up - cron auto-reshuffle (0009/0011/0018/0025)
-- mengubah assigned_to, admin melepas kontak ke pool, dst. Baris yang
-- sudah lama berjadwal follow-up jauh (dari SEBELUM migrasi ini ada) tidak
-- boleh mendadak gagal di-update oleh proses-proses itu hanya karena
-- next_follow_up_at-nya kebetulan ikut terbawa di baris yang sama. Trigger
-- ini SENGAJA cuma menyalakan pengecekan kalau next_follow_up_at itu
-- sendiri yang benar-benar berubah nilainya (atau baris barunya di-INSERT)
-- - kalau aturan ini dilanggar, cron produksi bisa gagal berjalan.
--
-- Tidak ada data lama yang diubah di migrasi ini - murni tambah kolom
-- (default NULL) dan pasang trigger untuk perubahan berikutnya.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kolom alasan - diisi agen kalau jadwalnya lebih dari 7 hari.
-- ---------------------------------------------------------------------
alter table public.contacts
  add column if not exists alasan_jadwal_panjang text;

-- ---------------------------------------------------------------------
-- 2. Fungsi trigger validasi.
-- ---------------------------------------------------------------------
create or replace function public.validasi_jadwal_followup_panjang()
returns trigger
language plpgsql
as $$
declare
  v_melebihi_7_hari boolean;
begin
  -- WAJIB: validasi cuma jalan untuk INSERT, atau UPDATE yang BENAR-BENAR
  -- mengubah next_follow_up_at. UPDATE lain (assigned_to, status_call,
  -- notes, dst.) yang tidak menyentuh kolom ini dilewatkan apa adanya -
  -- jangan sampai baris lama yang sudah berjadwal jauh ikut divalidasi
  -- ulang atau alasannya ikut terhapus cuma karena proses lain meng-update
  -- baris yang sama.
  if TG_OP = 'UPDATE' and new.next_follow_up_at is not distinct from old.next_follow_up_at then
    return new;
  end if;

  -- Ambang batas dihitung dalam kalender WIB (+7 jam), pola yang sama
  -- persis dipakai public.is_contact_active_today() (0022/0023).
  v_melebihi_7_hari :=
    new.next_follow_up_at is not null
    and (new.next_follow_up_at + interval '7 hours')::date
        > (now() + interval '7 hours')::date + 7;

  if v_melebihi_7_hari then
    if coalesce(btrim(new.alasan_jadwal_panjang), '') = '' then
      raise exception 'Jadwal follow-up lebih dari 7 hari wajib disertai alasan.';
    end if;
  else
    -- Jadwal baru di dalam 7 hari, atau dikosongkan (null) - alasan lama
    -- (kalau ada) tidak relevan lagi dan HARUS dikosongkan juga, supaya
    -- tidak tertinggal dan salah masuk laporan JadwalJauhCard.
    new.alasan_jadwal_panjang := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Pasang trigger - drop dulu supaya migrasi ini idempoten (aman
--    dijalankan ulang).
-- ---------------------------------------------------------------------
drop trigger if exists trg_validasi_jadwal_followup_panjang on public.contacts;

create trigger trg_validasi_jadwal_followup_panjang
  before insert or update on public.contacts
  for each row execute function public.validasi_jadwal_followup_panjang();
