-- =====================================================================
-- 0030_pisah_rating_pekerjaan_status_kontrak.sql — pisahkan data nasabah
-- dari contacts.notes ke kolom sendiri: rating, pekerjaan, status kontrak.
-- =====================================================================
--
-- LATAR BELAKANG:
-- Kolom `catatan` di file upload CSV selama ini masuk ke contacts.notes,
-- dan isinya ternyata dua hal berbeda (terverifikasi di produksi 16 Okt):
--   - 2.969 kontak berisi PEKERJAAN ("wiraswasta", "pegawai swasta", ...)
--   - 455 kontak berisi RATING lama ("tinggi"/"sedang"), dari dua batch
--     upload 13 September
-- notes juga dipakai sistem untuk jejak otomatis ([HABIS_3X ...],
-- [Auto-reshuffle ...]), jadi data nasabah dan log sistem bercampur.
-- BARIS PERTAMA notes selalu catatan asli dari upload (0 dari seluruh
-- baris pertama berisi log sistem).
--
-- ISI:
--   1. Tambah contacts.rating (text) dan contacts.pekerjaan (text).
--   2. Backfill dari baris pertama notes (split_part(notes, E'\n', 1)),
--      setelah dirapikan (huruf kecil, spasi dirapatkan):
--        'tinggi' / 'sedang' / 'rendah'              -> rating
--        nilai lain, tidak kosong, tidak diawali '['  -> pekerjaan
--      notes TIDAK diubah/dihapus - tetap sebagai jejak. Hanya kolom yang
--      masih kosong yang diisi (tidak menimpa).
--   3. Status kontrak memakai kolom YANG SUDAH ADA
--      contacts.status_kredit_kendaraan (semua barisnya kosong). Kolom
--      itu punya CHECK bawaan 0001 ('Lunas','Masih Kredit','Tidak Tahu')
--      yang akan MENOLAK RRD/ICP/EXP/LIV - CHECK lama itu dibuang, diganti
--      CHECK baru: null atau RRD/ICP/EXP/LIV.
--   4. system_config: prioritas_rating dan prioritas_kontrak (disiapkan
--      untuk PR berikutnya, BELUM dipakai apa pun di sini).
--
-- PAGAR (migrasi BERHENTI dengan error, tanpa mengubah apa pun, kalau):
--   - ada nilai status_kredit_kendaraan selain null/RRD/ICP/EXP/LIV;
--   - kandidat rating di luar 400-500, atau pekerjaan di luar 2.800-3.100.
--   Pagar dihitung dari isi notes (bukan dari kolom baru), jadi tetap
--   benar kalau migrasi dijalankan ulang. Semua pagar diperiksa SEBELUM
--   DDL apa pun.
--
-- updated_at: trigger contacts_updated_at (handle_updated_at) menimpa
-- updated_at = now() pada setiap UPDATE. updated_at dipakai
-- assign_contacts_to_agent (urutan daur ulang) dan cron reshuffle
-- (updated_at <= now() - 3 hari) - backfill ~3.400 baris TANPA perlindungan
-- akan mengacak urutan daur ulang dan menunda pelepasan 3 hari. Karena itu
-- trigger dimatikan HANYA di dalam blok backfill (satu pernyataan DO,
-- atomik: kalau gagal, semuanya batal termasuk status trigger) lalu
-- dinyalakan lagi di blok yang sama.
--
-- Cadangan untuk rollback: public.backup_pisah_notes_0030 (id kontak dan
-- nilai yang diisi). Rollback: supabase/rollbacks/0030_rollback_*.sql.
-- Uji:      supabase/rollbacks/0030_uji_transaksi.sql (dibatalkan sendiri).
--
-- URUTAN DEPLOY: jalankan migrasi ini SEBELUM men-deploy kode aplikasi
-- yang membaca kolom rating/pekerjaan (CONTACT_SELECT) - kode baru
-- memilih kolom itu dan antrean agen gagal kalau kolomnya belum ada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Pagar - diperiksa sebelum DDL/DML apa pun.
-- ---------------------------------------------------------------------
do $pagar$
declare
  v_nilai_lain text;
  v_rating     integer;
  v_pekerjaan  integer;
begin
  select string_agg(distinct status_kredit_kendaraan, ', ') into v_nilai_lain
  from public.contacts
  where status_kredit_kendaraan is not null
    and status_kredit_kendaraan not in ('RRD', 'ICP', 'EXP', 'LIV');

  if v_nilai_lain is not null then
    raise exception
      'Migrasi 0030 dihentikan: status_kredit_kendaraan berisi nilai tak terduga (%). Seharusnya kosong semua. Tidak ada yang diubah - laporkan dulu.',
      v_nilai_lain;
  end if;

  select
    count(*) filter (where v in ('tinggi', 'sedang', 'rendah')),
    count(*) filter (where v not in ('tinggi', 'sedang', 'rendah')
                       and v <> '' and left(v, 1) <> '[')
  into v_rating, v_pekerjaan
  from (
    select btrim(regexp_replace(lower(split_part(notes, E'\n', 1)), '\s+', ' ', 'g')) as v
    from public.contacts
    where notes is not null
  ) t;

  if v_rating not between 400 and 500 or v_pekerjaan not between 2800 and 3100 then
    raise exception
      'Migrasi 0030 dihentikan: kandidat rating = % (diharapkan 400-500, ~455) dan pekerjaan = % (diharapkan 2800-3100, ~2969). Tidak ada yang diubah - periksa dulu.',
      v_rating, v_pekerjaan;
  end if;
end;
$pagar$;

-- ---------------------------------------------------------------------
-- 1. Kolom baru.
-- ---------------------------------------------------------------------
alter table public.contacts add column if not exists rating text;
alter table public.contacts add column if not exists pekerjaan text;

comment on column public.contacts.rating is
  'Rating nasabah dari file upload. Kanonik: Excellent, Good, CR-1, CR-2, '
  'CR-3, Normal, Inactive. Juga bisa berisi rating LAMA huruf kecil '
  '(tinggi/sedang/rendah) dari batch upload 13 September 2026 - hasil '
  'backfill 0030. Dipasang impor CSV, bukan diubah agen. Lihat 0030.';

comment on column public.contacts.pekerjaan is
  'Pekerjaan nasabah dari file upload (huruf kecil, spasi dirapatkan). '
  'Dulu tercampur di contacts.notes. Lihat 0030.';

-- ---------------------------------------------------------------------
-- 2. Status kontrak = status_kredit_kendaraan. Buang CHECK lama (0001)
--    yang menolak nilai baru, ganti CHECK baru. Nama CHECK lama dicari
--    dinamis - nama bawaan inline bisa berbeda antar-database.
-- ---------------------------------------------------------------------
do $kontrak$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.contacts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status_kredit_kendaraan%'
  loop
    execute format('alter table public.contacts drop constraint %I', r.conname);
  end loop;
end;
$kontrak$;

alter table public.contacts
  add constraint contacts_status_kontrak_check
  check (status_kredit_kendaraan is null
         or status_kredit_kendaraan in ('RRD', 'ICP', 'EXP', 'LIV'));

comment on column public.contacts.status_kredit_kendaraan is
  'STATUS KONTRAK dari file upload: RRD (Ready to Release Document - BPKB '
  'siap dilepas), ICP (In Complete Payment - tinggal sisa denda), EXP '
  '(Expired - kontrak selesai), LIV (Live - masih kredit berjalan, peluang '
  'take over). Nama kolom lama dipakai ulang (0030). Dipasang impor CSV, '
  'bukan diubah agen.';

-- ---------------------------------------------------------------------
-- 3. Tabel cadangan backfill - satu baris per kontak yang diisi.
--    RLS aktif TANPA policy; hak anon/authenticated dicabut.
-- ---------------------------------------------------------------------
create table if not exists public.backup_pisah_notes_0030 (
  contact_id uuid primary key,
  rating     text,
  pekerjaan  text,
  dibuat_at  timestamptz not null default now()
);

alter table public.backup_pisah_notes_0030 enable row level security;
revoke all on public.backup_pisah_notes_0030 from anon, authenticated;

comment on table public.backup_pisah_notes_0030 is
  'Nilai rating/pekerjaan yang diisi backfill 0030 per kontak - dipakai '
  'rollback (hanya mengosongkan yang masih sama). Bukan data operasional.';

-- ---------------------------------------------------------------------
-- 4. Backfill dari baris pertama notes. notes TIDAK diubah. Trigger
--    updated_at dimatikan hanya di sini (lihat catatan di atas).
-- ---------------------------------------------------------------------
do $backfill$
declare
  v_rating    integer;
  v_pekerjaan integer;
begin
  alter table public.contacts disable trigger contacts_updated_at;

  with kandidat as (
    select s.id, s.rating_baru, s.pekerjaan_baru
    from (
      select
        c.id,
        c.rating as rating_lama,
        c.pekerjaan as pekerjaan_lama,
        case when t.v in ('tinggi', 'sedang', 'rendah') then t.v end as rating_baru,
        case when t.v <> '' and left(t.v, 1) <> '[' and t.v not in ('tinggi', 'sedang', 'rendah')
             then t.v end as pekerjaan_baru
      from public.contacts c
      cross join lateral (
        select btrim(regexp_replace(lower(split_part(c.notes, E'\n', 1)), '\s+', ' ', 'g')) as v
      ) t
      where c.notes is not null
    ) s
    where (s.rating_baru is not null and s.rating_lama is null)
       or (s.pekerjaan_baru is not null and s.pekerjaan_lama is null)
  ),
  cadangan as (
    insert into public.backup_pisah_notes_0030 (contact_id, rating, pekerjaan)
    select id, rating_baru, pekerjaan_baru from kandidat
    on conflict (contact_id) do nothing
    returning contact_id
  ),
  ubah as (
    update public.contacts c
    set rating    = coalesce(c.rating, k.rating_baru),
        pekerjaan = coalesce(c.pekerjaan, k.pekerjaan_baru)
    from kandidat k
    where c.id = k.id
    returning k.rating_baru, k.pekerjaan_baru
  )
  select count(rating_baru), count(pekerjaan_baru)
    into v_rating, v_pekerjaan
  from ubah;

  alter table public.contacts enable trigger contacts_updated_at;

  raise notice 'Backfill 0030: rating diisi % kontak, pekerjaan diisi % kontak.',
    v_rating, v_pekerjaan;
end;
$backfill$;

-- ---------------------------------------------------------------------
-- 5. Konfigurasi prioritas - DISIAPKAN untuk PR berikutnya, belum dipakai.
-- ---------------------------------------------------------------------
insert into public.system_config (key, value) values
  ('prioritas_rating',  'Excellent,Good,CR-1,CR-2,CR-3,Normal,Inactive'),
  ('prioritas_kontrak', 'RRD,ICP,EXP,LIV')
on conflict (key) do nothing;
