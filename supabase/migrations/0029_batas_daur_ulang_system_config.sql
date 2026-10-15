-- =====================================================================
-- 0029_batas_daur_ulang_system_config.sql — batas harian pengambilan data
-- daur ulang dipindah dari konstanta di fungsi ke tabel system_config.
-- =====================================================================
--
-- MASALAH:
-- assign_contacts_to_agent() menanam dua batas harian sebagai konstanta
--   v_warm_daily_cap    constant int := 30;
--   v_inprog_daily_cap  constant int := 120;
-- Batas In Progress sudah dua kali diubah (40 -> 120, sekarang perlu 60),
-- dan tiap perubahan butuh migrasi baru.
--
-- ISI:
--   1. Dua kunci system_config (insert ... on conflict do nothing, tidak
--      menimpa kalau sudah ada):
--        recycled_warm_daily_cap       = '30'
--        recycled_inprogress_daily_cap = '60'
--   2. Tabel public.backup_fungsi_definisi + cadangan definisi fungsi
--      YANG SEDANG BERJALAN, diambil dengan pg_get_functiondef.
--   3. assign_contacts_to_agent() ditambal: kedua batas dibaca dari
--      system_config (pola yang sama dengan 'uncalled_claim_enabled'),
--      fallback ke 30 dan 60 kalau barisnya tidak ada atau isinya bukan
--      angka bulat (0 sah = tahap itu ditutup).
--
-- DASAR DEFINISI - PENTING:
-- Definisi dasarnya BUKAN file 0027. Blok DO di bawah mengambil definisi
-- yang sedang berjalan di database ini lewat pg_get_functiondef(), lalu
-- menambalnya secara teks di TIGA titik saja:
--   (a) deklarasi v_warm_daily_cap    : "constant int := N" -> "int := 30"
--   (b) deklarasi v_inprog_daily_cap  : "constant int := N" -> "int := 60"
--                                       (+ satu variabel bantu v_cap_text)
--   (c) sebelum baris penghitung sisa batas (v_warm_cap_remaining := ...):
--       dua pembacaan system_config.
-- Setiap titik HARUS ditemukan TEPAT SEKALI. Kalau tidak (berarti
-- produksi berbeda dari yang diharapkan), blok berhenti dengan error dan
-- TIDAK ada yang berubah - fungsi tidak pernah ditulis ulang dari ingatan.
-- Bagian lain fungsi (SECURITY DEFINER, search_path, isi, hak akses)
-- dibawa apa adanya dari definisi produksi.
--
-- IDEMPOTEN: dijalankan ulang setelah sukses -> definisi sudah memuat
-- 'recycled_warm_daily_cap' -> dilewati dengan NOTICE, tanpa cadangan baru.
--
-- UBAH BATAS DI KEMUDIAN HARI (tanpa migrasi, berlaku di klaim berikutnya):
--   update public.system_config set value = '60', updated_at = now()
--    where key = 'recycled_inprogress_daily_cap';
--   update public.system_config set value = '30', updated_at = now()
--    where key = 'recycled_warm_daily_cap';
--
-- ROLLBACK: supabase/rollbacks/0029_rollback_batas_daur_ulang.sql
-- (memulihkan definisi dari public.backup_fungsi_definisi).
-- UJI:      supabase/rollbacks/0029_uji_transaksi.sql (dibatalkan sendiri).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kunci system_config (tidak menimpa kalau sudah ada).
-- ---------------------------------------------------------------------
insert into public.system_config (key, value) values
  ('recycled_warm_daily_cap', '30'),
  ('recycled_inprogress_daily_cap', '60')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Tabel cadangan definisi fungsi. RLS aktif TANPA policy dan hak
--    anon/authenticated dicabut - hanya service role / SQL Editor.
-- ---------------------------------------------------------------------
create table if not exists public.backup_fungsi_definisi (
  id          bigserial primary key,
  fungsi      text not null,
  migrasi     text not null,
  definisi    text not null,
  disimpan_at timestamptz not null default now()
);

alter table public.backup_fungsi_definisi enable row level security;
revoke all on public.backup_fungsi_definisi from anon, authenticated;

comment on table public.backup_fungsi_definisi is
  'Cadangan definisi fungsi (pg_get_functiondef) SEBELUM sebuah migrasi '
  'mengubahnya - dipakai file rollback di supabase/rollbacks. Bukan data '
  'operasional.';

-- ---------------------------------------------------------------------
-- 3. Tambal assign_contacts_to_agent() dari definisi yang sedang berjalan.
-- ---------------------------------------------------------------------
do $migrasi$
declare
  v_fungsi constant text := 'public.assign_contacts_to_agent(uuid,integer)';
  v_def    text;
  v_baru   text;
  v_n      integer;

  -- Pola toleran spasi/huruf "int" atau "integer" dan angka berapa pun
  -- (produksi mungkin sudah menyimpang dari file 0027).
  c_decl_warm   constant text := 'v_warm_daily_cap\s+constant\s+int(?:eger)?\s*:=\s*[0-9]+\s*;';
  c_decl_inprog constant text := 'v_inprog_daily_cap\s+constant\s+int(?:eger)?\s*:=\s*[0-9]+\s*;';
  c_sisa_warm   constant text := 'v_warm_cap_remaining\s*:=\s*greatest\(\s*0\s*,\s*v_warm_daily_cap\s*-\s*v_warm_taken_today\s*\)\s*;';

  -- Disisipkan tepat sebelum penghitung sisa batas. TANPA backslash dan
  -- TANPA tanda dolar ganda (aman untuk regexp_replace dan pg_get_functiondef).
  c_baca constant text := $inj$-- Batas harian daur ulang dibaca dari system_config (migrasi 0029).
  -- Baris tidak ada / bukan angka bulat -> nilai bawaan di deklarasi dipakai.
  v_cap_text := null;
  select btrim(value) into v_cap_text
  from public.system_config
  where key = 'recycled_warm_daily_cap';
  if v_cap_text ~ '^[0-9]{1,6}$' then
    v_warm_daily_cap := v_cap_text::int;
  end if;

  v_cap_text := null;
  select btrim(value) into v_cap_text
  from public.system_config
  where key = 'recycled_inprogress_daily_cap';
  if v_cap_text ~ '^[0-9]{1,6}$' then
    v_inprog_daily_cap := v_cap_text::int;
  end if;

  $inj$;
begin
  if to_regprocedure(v_fungsi) is null then
    raise exception 'Migrasi 0029 dihentikan: fungsi % tidak ditemukan. Tidak ada yang diubah.', v_fungsi;
  end if;

  v_def := pg_get_functiondef(to_regprocedure(v_fungsi));

  if position('recycled_warm_daily_cap' in v_def) > 0 then
    raise notice 'Migrasi 0029: fungsi sudah membaca batas dari system_config - dilewati.';
    return;
  end if;

  if position('v_cap_text' in v_def) > 0 then
    raise exception 'Migrasi 0029 dihentikan: nama variabel bantu v_cap_text sudah dipakai di fungsi. Tidak ada yang diubah.';
  end if;

  -- Setiap titik tambal harus ada TEPAT SEKALI.
  select count(*) into v_n from regexp_matches(v_def, c_decl_warm, 'g');
  if v_n <> 1 then
    raise exception 'Migrasi 0029 dihentikan: deklarasi v_warm_daily_cap ditemukan % kali (harus 1). Definisi produksi berbeda dari yang diharapkan. Tidak ada yang diubah.', v_n;
  end if;

  select count(*) into v_n from regexp_matches(v_def, c_decl_inprog, 'g');
  if v_n <> 1 then
    raise exception 'Migrasi 0029 dihentikan: deklarasi v_inprog_daily_cap ditemukan % kali (harus 1). Definisi produksi berbeda dari yang diharapkan. Tidak ada yang diubah.', v_n;
  end if;

  select count(*) into v_n from regexp_matches(v_def, c_sisa_warm, 'g');
  if v_n <> 1 then
    raise exception 'Migrasi 0029 dihentikan: baris penghitung sisa batas Warm ditemukan % kali (harus 1). Definisi produksi berbeda dari yang diharapkan. Tidak ada yang diubah.', v_n;
  end if;

  -- Cadangkan definisi yang sedang berjalan SEBELUM mengubah apa pun.
  insert into public.backup_fungsi_definisi (fungsi, migrasi, definisi)
  values (v_fungsi, '0029', v_def);

  v_baru := v_def;
  v_baru := regexp_replace(v_baru, c_decl_warm, 'v_warm_daily_cap int := 30;');
  v_baru := regexp_replace(v_baru, c_decl_inprog,
    'v_inprog_daily_cap int := 60;' || E'\n  ' || 'v_cap_text text;');
  v_baru := regexp_replace(v_baru, c_sisa_warm, c_baca || '\&');

  if v_baru = v_def then
    raise exception 'Migrasi 0029 dihentikan: penambalan tidak mengubah apa pun (tidak terduga). Tidak ada yang diubah.';
  end if;

  execute v_baru;

  -- Pastikan fungsi yang kini berjalan memang memuat tambalan.
  if position('recycled_inprogress_daily_cap'
              in pg_get_functiondef(to_regprocedure(v_fungsi))) = 0 then
    raise exception 'Migrasi 0029 dihentikan: tambalan tidak terbaca di fungsi setelah dibuat ulang. Tidak ada yang diubah.';
  end if;

  raise notice 'Migrasi 0029: assign_contacts_to_agent() sekarang membaca batas dari system_config. Definisi lama dicadangkan di public.backup_fungsi_definisi.';
end;
$migrasi$;
