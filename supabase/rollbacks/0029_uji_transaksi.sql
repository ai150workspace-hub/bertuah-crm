-- =====================================================================
-- UJI TRANSAKSI untuk 0029_batas_daur_ulang_system_config.sql
-- =====================================================================
-- BUKAN migrasi: jangan taruh di supabase/migrations. Aman ditempel SEKALI
-- ke Supabase SQL Editor (produksi): seluruh isi 0029 dijalankan DI DALAM
-- transaksi, fungsinya diuji beberapa skenario, lalu transaksinya
-- DIBATALKAN - tidak ada kontak, hitungan agen, fungsi, tabel, maupun
-- system_config yang tersisa.
--
-- CARA MEMBACA HASIL:
--   SQL Editor hanya menampilkan hasil pernyataan TERAKHIR, jadi semua
--   angka ditampilkan lewat blok DO di akhir yang SENGAJA melempar error
--   berisi angka (sekaligus membatalkan transaksi). Yang muncul adalah
--   ERROR berawalan "UJI 0029 SELESAI" - itu hasil SUKSES.
--
--   "Backfill/Migrasi 0029 dihentikan: ..." = pagar tambalan bekerja
--   (definisi produksi berbeda dari yang diharapkan). Tidak ada yang
--   berubah; JANGAN jalankan migrasinya - kirim pesan errornya.
--
-- APA YANG DIUJI (semua di dalam transaksi, jadi pemanggilan fungsi yang
-- sebenarnya MENGUBAH data akan ikut dibatalkan):
--   A. batas diturunkan ke warm=1 / inprogress=2  -> pengambilan dibatasi
--   B. nilai 'abc' dan baris dihapus -> fallback 30 / 60 (bukan 120)
--   C. inprogress=150 -> batas dibaca, melebihi nilai fallback 60
--   Saklar uncalled_claim_enabled dimatikan selama uji supaya tahap
--   Uncalled tidak ikut mengisi kapasitas agen uji.
--
-- File ini salinan 0029 apa adanya (di antara penanda BEGIN/END SALINAN).
-- Kalau 0029 diubah, rakit ulang file ini.
-- =====================================================================

begin;

-- ===================== BEGIN SALINAN 0029 =====================
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

-- ===================== END SALINAN 0029 =====================

-- ---------------------------------------------------------------------
-- VERIFIKASI + UJI PEMANGGILAN (masih di dalam transaksi).
-- ---------------------------------------------------------------------
do $uji$
declare
  v_fungsi constant text := 'public.assign_contacts_to_agent(uuid,integer)';
  v_def        text;
  v_cfg_warm   text;
  v_cfg_inprog text;
  v_n_backup   integer;
  v_len_backup integer;
  v_cadangan_ok boolean;

  v_agent      uuid;
  v_nama       text;
  v_pool_warm  integer;
  v_pool_ip    integer;

  v_a_assigned integer; v_a_reason text; v_a_warm integer; v_a_ip integer;
  v_b_assigned integer; v_b_reason text; v_b_warm integer; v_b_ip integer;
  v_c_assigned integer; v_c_reason text; v_c_warm integer; v_c_ip integer;
  v_msg        text;
begin
  -- 1. Keadaan setelah migrasi (SEBELUM skenario mengubah system_config).
  select value into v_cfg_warm   from public.system_config where key = 'recycled_warm_daily_cap';
  select value into v_cfg_inprog from public.system_config where key = 'recycled_inprogress_daily_cap';

  v_def := pg_get_functiondef(to_regprocedure(v_fungsi));

  select count(*), coalesce(max(length(definisi)), 0)
    into v_n_backup, v_len_backup
  from public.backup_fungsi_definisi
  where fungsi = v_fungsi and migrasi = '0029';

  select exists (
    select 1 from public.backup_fungsi_definisi
    where fungsi = v_fungsi and migrasi = '0029'
      and position('recycled_warm_daily_cap' in definisi) = 0
      and position('v_inprog_daily_cap' in definisi) > 0
  ) into v_cadangan_ok;

  -- 2. Pilih agen uji yang masih punya slot dan tidak di-pause.
  select u.id, u.name into v_agent, v_nama
  from public.users u
  where u.role = 'agent' and u.is_active and u.agent_status = 'active'
    and coalesce((select s.available from public.get_agent_active_slots(u.id) s limit 1), 0) > 0
  order by u.name
  limit 1;

  -- Persediaan di pool (konteks: "0 diambil" karena batas atau karena kosong?).
  select count(*) into v_pool_warm
  from public.contacts c
  where c.status_call = 'Warm' and c.assigned_to is null
    and not (coalesce(c.tags, '{}') @> '{ARSIP}')
    and exists (select 1 from public.call_logs cl where cl.contact_id = c.id);

  select count(*) into v_pool_ip
  from public.contacts c
  where c.status_call = 'In Progress' and c.assigned_to is null
    and not (coalesce(c.tags, '{}') @> '{ARSIP}')
    and exists (select 1 from public.call_logs cl where cl.contact_id = c.id)
    and (select count(*) from public.call_logs cl where cl.contact_id = c.id) < 3
    and not exists (
      select 1 from public.call_logs cl
      where cl.contact_id = c.id
        and (cl."timestamp" + interval '7 hours')::date = (now() + interval '7 hours')::date
    );

  if v_agent is not null then
    -- Tahap Uncalled dimatikan selama uji (di dalam transaksi).
    update public.system_config set value = 'false' where key = 'uncalled_claim_enabled';

    -- Skenario A: batas rendah (warm=1, inprogress=2), counter 0.
    update public.system_config set value = '1' where key = 'recycled_warm_daily_cap';
    update public.system_config set value = '2' where key = 'recycled_inprogress_daily_cap';
    update public.users
       set recycled_warm_taken_today = 0, recycled_inprogress_taken_today = 0,
           recycled_counter_date = current_date
     where id = v_agent;
    select assigned_count, rejected_reason into v_a_assigned, v_a_reason
      from public.assign_contacts_to_agent(v_agent, 50);
    select recycled_warm_taken_today, recycled_inprogress_taken_today into v_a_warm, v_a_ip
      from public.users where id = v_agent;

    -- Skenario B: nilai 'abc' + baris Warm dihapus -> fallback 30 / 60.
    -- Counter dikondisikan dekat batas: warm 25 (sisa 5 dari 30),
    -- inprogress 55 (sisa 5 dari 60; kalau batas masih 120 bisa sampai 105).
    update public.system_config set value = 'abc' where key = 'recycled_inprogress_daily_cap';
    delete from public.system_config where key = 'recycled_warm_daily_cap';
    update public.users
       set recycled_warm_taken_today = 25, recycled_inprogress_taken_today = 55,
           recycled_counter_date = current_date
     where id = v_agent;
    select assigned_count, rejected_reason into v_b_assigned, v_b_reason
      from public.assign_contacts_to_agent(v_agent, 50);
    select recycled_warm_taken_today, recycled_inprogress_taken_today into v_b_warm, v_b_ip
      from public.users where id = v_agent;

    -- Skenario C: inprogress=150 dibaca (di atas fallback 60). Counter
    -- inprogress 100 -> dengan fallback 60 tidak ada sisa; dengan 150
    -- sisanya 50.
    insert into public.system_config (key, value) values ('recycled_warm_daily_cap', '30')
      on conflict (key) do update set value = excluded.value;
    update public.system_config set value = '150' where key = 'recycled_inprogress_daily_cap';
    update public.users
       set recycled_warm_taken_today = 0, recycled_inprogress_taken_today = 100,
           recycled_counter_date = current_date
     where id = v_agent;
    select assigned_count, rejected_reason into v_c_assigned, v_c_reason
      from public.assign_contacts_to_agent(v_agent, 50);
    select recycled_warm_taken_today, recycled_inprogress_taken_today into v_c_warm, v_c_ip
      from public.users where id = v_agent;
  end if;

  v_msg :=
    E'UJI 0029 SELESAI - transaksi DIBATALKAN, tidak ada yang berubah.\n' ||
    E'\n--- Keadaan setelah migrasi ---\n' ||
    format(E'recycled_warm_daily_cap .................. %s (harap 30, atau nilai yang sudah ada)\n', coalesce(v_cfg_warm, '(tidak ada)')) ||
    format(E'recycled_inprogress_daily_cap ............ %s (harap 60, atau nilai yang sudah ada)\n', coalesce(v_cfg_inprog, '(tidak ada)')) ||
    format(E'Fungsi membaca cap Warm .................. %s (harus true)\n', position('recycled_warm_daily_cap' in v_def) > 0) ||
    format(E'Fungsi membaca cap In Progress ........... %s (harus true)\n', position('recycled_inprogress_daily_cap' in v_def) > 0) ||
    format(E'Fungsi masih punya "constant" untuk cap .. %s (harus false)\n',
           v_def ~ 'v_(warm|inprog)_daily_cap\s+constant') ||
    format(E'Fungsi SECURITY DEFINER .................. %s (harus true)\n', position('SECURITY DEFINER' in v_def) > 0) ||
    format(E'Cadangan definisi: baris %s, panjang %s, layak dipakai rollback: %s (harus 1 / > 0 / true)\n', v_n_backup, v_len_backup, v_cadangan_ok) ||
    E'\n--- Uji pemanggilan (agen uji: ' || coalesce(v_nama, '(TIDAK ADA agen yang tersedia - skenario dilewati)') || E') ---\n' ||
    format(E'Persediaan pool: Warm daur ulang %s, In Progress layak %s\n', v_pool_warm, v_pool_ip) ||
    format(E'A (cap warm=1, inprog=2, counter 0/0): diambil %s; counter sesudah warm=%s inprog=%s  -> harus warm<=1 dan inprog<=2%s\n',
           v_a_assigned, v_a_warm, v_a_ip, coalesce(E'  [ditolak: ' || v_a_reason || ']', '')) ||
    format(E'B (cap ''abc''/hilang -> fallback 30/60; counter 25/55): diambil %s; counter sesudah warm=%s inprog=%s  -> harus warm<=30 dan inprog<=60%s\n',
           v_b_assigned, v_b_warm, v_b_ip, coalesce(E'  [ditolak: ' || v_b_reason || ']', '')) ||
    format(E'C (cap inprog=150; counter 0/100): diambil %s; counter sesudah warm=%s inprog=%s  -> inprog harus <=150 dan BOLEH >100 (bukti nilai dibaca, bukan fallback 60)%s\n',
           v_c_assigned, v_c_warm, v_c_ip, coalesce(E'  [ditolak: ' || v_c_reason || ']', ''));

  raise exception '%', v_msg;
end;
$uji$;

-- Jaga-jaga: tidak pernah tercapai kalau editor berhenti di error di atas.
rollback;
