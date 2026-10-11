-- =====================================================================
-- UJI TRANSAKSI untuk 0028_status_tidak_terjangkau.sql
-- =====================================================================
-- BUKAN migrasi: jangan taruh di supabase/migrations. Aman ditempel SEKALI
-- ke Supabase SQL Editor (produksi) dan dijalankan: seluruh isi 0028 di
-- bawah ini dijalankan DI DALAM transaksi, angka verifikasinya dihitung,
-- lalu transaksinya DIBATALKAN - tidak ada data, tabel, fungsi, constraint,
-- maupun cron yang tersisa.
--
-- CARA MEMBACA HASIL:
--   SQL Editor hanya menampilkan hasil pernyataan TERAKHIR. Karena itu
--   angka verifikasi ditampilkan lewat blok DO di akhir yang sengaja
--   melempar error berisi semua angka (sekaligus membatalkan transaksi).
--   JADI: yang muncul adalah ERROR berawalan "UJI 0028 SELESAI" - itu
--   hasil SUKSES. Baca angkanya di pesan itu. Rollback eksplisit di baris
--   paling akhir hanya jaga-jaga untuk editor yang terus mengeksekusi
--   setelah error.
--
-- HARAPAN:
--   Tidak Terjangkau ........ ~424 (naik ~45/hari; pagar migrasi 400-600)
--   baris backup_habis3x .... SAMA dengan Tidak Terjangkau
--   tag HABIS_3X ............ SAMA dengan Tidak Terjangkau
--   In Progress >=3 log ..... 0 (non-ARSIP)
--   Warm / Hot Lead >=3 log . tetap 7 dan 4 (angka 11 Okt)
--   In Progress ARSIP >=3 ... tetap (6 pada 11 Okt) - tidak disentuh
--   Tidak Terjangkau masih ber-assigned_to/assigned_at ... 0
--   command cron memuat tandai_tidak_terjangkau ... true
--
-- KALAU yang muncul "Backfill 0028 dihentikan: kandidat = N ...": pagar
-- jumlah bekerja (N di luar 400-600). Tidak ada yang berubah; periksa dulu.
-- KALAU yang muncul error sintaks: JANGAN jalankan migrasinya - laporkan.
--
-- File ini salinan 0028 apa adanya (di antara penanda BEGIN/END SALINAN).
-- Kalau 0028 diubah, rakit ulang file ini.
-- =====================================================================

begin;

-- ===================== BEGIN SALINAN 0028 =====================
-- =====================================================================
-- 0028_status_tidak_terjangkau.sql — status akhir 'Tidak Terjangkau' untuk
-- kontak In Progress yang percobaannya sudah habis (>= 3 panggilan).
-- =====================================================================
--
-- MASALAH:
-- Pagar "maksimal 3 percobaan" (0027) cuma berlaku di jalur klaim
-- assign_contacts_to_agent (saat kontak diambil dari pool). Kontak yang
-- SUDAH dipegang agen tidak terjaga: ada kontak In Progress yang ditelepon
-- sampai ke-4 kali. Akibatnya kontak In Progress yang sudah >= 3 kali
-- ditelepon tetap menghuni antrean agen dan ikut terhitung sebagai
-- persediaan kerja, padahal tidak akan ditelepon lagi (~45 baru per hari).
--
-- ISI:
--   1. status_call baru 'Tidak Terjangkau' (CHECK constraint, pola 0003/
--      0012). Status ini DIISI SISTEM, tidak ada di katalog hasil
--      panggilan - agen tidak punya cara memilihnya. Bukan bagian
--      ACTIVE_STATUSES dan tidak ada di is_contact_active_today().
--   2. Fungsi public.tandai_tidak_terjangkau(): memindahkan kontak
--        status_call = 'In Progress'
--        DAN punya >= 3 baris call_logs (milik agen mana pun)
--        DAN tidak bertag ARSIP
--      ke 'Tidak Terjangkau': assigned_to/assigned_at dikosongkan, tag
--      'HABIS_3X' ditambahkan, dan keadaan lama (status_call, assigned_to,
--      assigned_at) disimpan di tabel cadangan public.backup_habis3x -
--      DIISI OLEH FUNGSI ITU SENDIRI, jadi kontak yang dipindah cron
--      harian ikut tercadangkan, bukan hanya backfill. Rollback membaca
--      dari tabel itu (lihat supabase/rollbacks/0028_rollback_*). Catatan
--      di notes tetap ditulis, hanya sebagai jejak yang bisa dibaca orang.
--      Warm, Hot Lead, Inbound, dan kontak ARSIP SENGAJA tidak disentuh.
--   3. Backfill sekali jalan (dengan pagar jumlah, lihat bawah).
--   4. Cron 'auto-reshuffle-overdue-followup' (jalan 23:00 UTC = 06:00
--      WIB) memanggil fungsi di atas LEBIH DULU, baru reshuffle seperti
--      biasa - supaya tidak menumpuk lagi. Dipilih cron, bukan cek saat
--      simpan call log: tidak menambah titik gagal di jalur agen, dan
--      menangkap semua jalur penulisan call log.
--
-- PAGAR JUMLAH (bagian 3): saat dibuat (11 Okt), kandidat di produksi =
-- 424 dan bertambah ~45 per hari. Kalau saat migrasi dijalankan jumlahnya
-- di luar [v_min, v_max] = [400, 600], migrasi BERHENTI (raise exception,
-- tidak ada yang berubah) - jumlah yang jauh berbeda berarti ada yang tidak
-- terduga dan perlu dilihat dulu. 600 memberi ruang sekitar 3-4 hari.
-- Dijalankan ULANG setelah sukses, pagar ini juga akan menghentikannya
-- (kandidat ~0 < v_min) - itu disengaja dan aman, bukan kegagalan.
--
-- Dasar cron: definisi 0027 (bagian C) - satu-satunya perubahan adalah
-- baris select public.tandai_tidak_terjangkau(); di depannya.
--
-- VERIFIKASI & ROLLBACK: lihat deskripsi PR dan
-- supabase/rollbacks/0028_rollback_tidak_terjangkau.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Status baru di CHECK constraint (daftar lengkap 0012 + status baru).
-- ---------------------------------------------------------------------
alter table public.contacts drop constraint if exists contacts_status_call_check;
alter table public.contacts add constraint contacts_status_call_check
  check (status_call in (
    'Uncalled','In Progress','Contacted','Hot Lead','Warm',
    'Closed','Submitted','Rejected','Invalid','Duplicate',
    'Inbound',
    'Tidak Terjangkau'
  ));

comment on column public.contacts.status_call is
  '''Inbound'' = lead dari website (lihat 0012). ''Tidak Terjangkau'' = '
  'kontak In Progress yang sudah >= 3 kali ditelepon, status akhir yang '
  'DIPASANG SISTEM (public.tandai_tidak_terjangkau, 0028) - bukan hasil '
  'panggilan yang dipilih agen. Ditandai tag HABIS_3X; keadaan lama ada di '
  'public.backup_habis3x.';

-- ---------------------------------------------------------------------
-- 2a. Tabel cadangan - keadaan lama tiap kontak yang dipindah. Satu baris
--     per pemindahan (kontak yang dipindah, dikembalikan, lalu dipindah
--     lagi punya dua baris; rollback memakai yang terbaru).
--     RLS aktif TANPA policy + hak anon/authenticated dicabut: hanya
--     service role / SQL Editor yang bisa membaca.
-- ---------------------------------------------------------------------
create table if not exists public.backup_habis3x (
  id               bigserial primary key,
  contact_id       uuid not null,
  status_call_lama text not null,
  assigned_to_lama uuid,
  assigned_at_lama timestamptz,
  jumlah_log       integer not null,
  dipindah_at      timestamptz not null default now()
);

create index if not exists idx_backup_habis3x_contact
  on public.backup_habis3x(contact_id);

alter table public.backup_habis3x enable row level security;
revoke all on public.backup_habis3x from anon, authenticated;

comment on table public.backup_habis3x is
  'Cadangan keadaan lama kontak yang dipindah ke ''Tidak Terjangkau'' oleh '
  'public.tandai_tidak_terjangkau() (0028). Dipakai supabase/rollbacks/'
  '0028_rollback_tidak_terjangkau.sql. Bukan data operasional.';

-- ---------------------------------------------------------------------
-- 2b. Fungsi pemindah. Mengembalikan jumlah baris yang dipindahkan.
--     Satu statement: kandidat dipilih sekali, dicadangkan, lalu dipindah
--     (data-modifying CTE) - keduanya dari kandidat yang sama persis.
-- ---------------------------------------------------------------------
create or replace function public.tandai_tidak_terjangkau()
returns integer
language plpgsql
as $$
declare
  v_jumlah integer;
begin
  with kandidat as (
    select c.id, c.status_call, c.assigned_to, c.assigned_at, n.jumlah
    from public.contacts c
    join (
      select contact_id, count(*) as jumlah
      from public.call_logs
      group by contact_id
      having count(*) >= 3
    ) n on n.contact_id = c.id
    where c.status_call = 'In Progress'
      and not (coalesce(c.tags, '{}') @> '{ARSIP}')
  ),
  cadangan as (
    insert into public.backup_habis3x
      (contact_id, status_call_lama, assigned_to_lama, assigned_at_lama, jumlah_log)
    select id, status_call, assigned_to, assigned_at, jumlah::integer
    from kandidat
    returning contact_id
  ),
  pindah as (
    update public.contacts c
    set
      status_call = 'Tidak Terjangkau',
      assigned_to = null,
      assigned_at = null,
      tags = array_append(coalesce(c.tags, '{}'), 'HABIS_3X'),
      notes = coalesce(c.notes, '') ||
        E'\n[HABIS_3X ' || (now() + interval '7 hours')::date ||
        ': status lama=In Progress; assigned_to lama=' ||
        coalesce(c.assigned_to::text, '-') || '; ' || k.jumlah || ' panggilan]'
    from kandidat k
    where c.id = k.id
    returning c.id
  )
  select count(*) into v_jumlah from pindah;

  return v_jumlah;
end;
$$;

-- Fungsi ini MENGUBAH data - tidak boleh bisa dipanggil klien lewat API.
-- Cron berjalan sebagai superuser, jadi tidak terpengaruh.
revoke all on function public.tandai_tidak_terjangkau() from public, anon, authenticated;

comment on function public.tandai_tidak_terjangkau is
  'Memindahkan kontak In Progress dengan >= 3 call log (bukan ARSIP) ke '
  'status akhir ''Tidak Terjangkau''. Dipanggil cron harian '
  '(auto-reshuffle-overdue-followup) dan backfill 0028. Lihat 0028.';

-- ---------------------------------------------------------------------
-- 3. Backfill sekali jalan, dengan pagar jumlah.
-- ---------------------------------------------------------------------
do $$
declare
  v_min       constant integer := 400;
  v_max       constant integer := 600;
  v_kandidat  integer;
  v_dipindah  integer;
begin
  select count(*) into v_kandidat
  from public.contacts c
  where c.status_call = 'In Progress'
    and not (coalesce(c.tags, '{}') @> '{ARSIP}')
    and (select count(*) from public.call_logs cl where cl.contact_id = c.id) >= 3;

  if v_kandidat < v_min or v_kandidat > v_max then
    raise exception
      'Backfill 0028 dihentikan: kandidat = % (diharapkan % - %). Tidak ada data yang diubah. Periksa dulu, lalu sesuaikan v_min/v_max kalau memang wajar.',
      v_kandidat, v_min, v_max;
  end if;

  v_dipindah := public.tandai_tidak_terjangkau();
  raise notice 'Backfill 0028: % kontak dipindah ke Tidak Terjangkau (kandidat sebelumnya %).',
    v_dipindah, v_kandidat;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Cron harian (dasar: 0027 bagian C). cron.schedule dengan nama yang
--    sama meng-upsert job. Langkah baru dijalankan PERTAMA.
-- ---------------------------------------------------------------------
select cron.schedule(
  'auto-reshuffle-overdue-followup',
  '0 23 * * *',
  $$
  select public.tandai_tidak_terjangkau();

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
    and (next_follow_up_at is null or next_follow_up_at < now())
    and not (coalesce(tags, '{}') @> '{ARSIP}')
    and assigned_to in (
      select id from public.users where agent_status = 'active'
    );
  $$
);

-- ===================== END SALINAN 0028 =====================

-- ---------------------------------------------------------------------
-- VERIFIKASI (masih di dalam transaksi). Satu blok, satu pesan, karena
-- SQL Editor hanya menampilkan hasil pernyataan terakhir.
-- ---------------------------------------------------------------------
do $$
declare
  v_tidak_terjangkau   integer;
  v_backup             integer;
  v_backup_kontak      integer;
  v_tag                integer;
  v_in_progress_sisa   integer;
  v_warm_3x            integer;
  v_hot_3x             integer;
  v_inbound_3x         integer;
  v_arsip_in_progress  integer;
  v_masih_dipegang     integer;
  v_cron_command       text;
  v_cron_schedule      text;
  v_cron_ok            boolean;
  v_msg                text;
begin
  select count(*) into v_tidak_terjangkau
  from public.contacts where status_call = 'Tidak Terjangkau';

  select count(*), count(distinct contact_id) into v_backup, v_backup_kontak
  from public.backup_habis3x;

  select count(*) into v_tag
  from public.contacts where tags @> '{HABIS_3X}';

  select count(*) into v_in_progress_sisa
  from public.contacts c
  where c.status_call = 'In Progress'
    and not (coalesce(c.tags, '{}') @> '{ARSIP}')
    and (select count(*) from public.call_logs cl where cl.contact_id = c.id) >= 3;

  select count(*) into v_warm_3x
  from public.contacts c
  where c.status_call = 'Warm'
    and (select count(*) from public.call_logs cl where cl.contact_id = c.id) >= 3;

  select count(*) into v_hot_3x
  from public.contacts c
  where c.status_call = 'Hot Lead'
    and (select count(*) from public.call_logs cl where cl.contact_id = c.id) >= 3;

  select count(*) into v_inbound_3x
  from public.contacts c
  where c.status_call = 'Inbound'
    and (select count(*) from public.call_logs cl where cl.contact_id = c.id) >= 3;

  select count(*) into v_arsip_in_progress
  from public.contacts c
  where c.status_call = 'In Progress'
    and (coalesce(c.tags, '{}') @> '{ARSIP}')
    and (select count(*) from public.call_logs cl where cl.contact_id = c.id) >= 3;

  select count(*) into v_masih_dipegang
  from public.contacts
  where status_call = 'Tidak Terjangkau'
    and (assigned_to is not null or assigned_at is not null);

  select command, schedule into v_cron_command, v_cron_schedule
  from cron.job where jobname = 'auto-reshuffle-overdue-followup';

  v_cron_ok := coalesce(position('tandai_tidak_terjangkau' in v_cron_command) > 0, false);

  v_msg :=
    E'UJI 0028 SELESAI - transaksi DIBATALKAN, tidak ada yang berubah.\n' ||
    format(E'Tidak Terjangkau ............................. %s (harap ~424)\n', v_tidak_terjangkau) ||
    format(E'Baris backup_habis3x ......................... %s (harus sama; kontak unik: %s)\n', v_backup, v_backup_kontak) ||
    format(E'Kontak ber-tag HABIS_3X ...................... %s (harus sama)\n', v_tag) ||
    format(E'In Progress non-ARSIP dengan >=3 log ......... %s (harus 0)\n', v_in_progress_sisa) ||
    format(E'Warm dengan >=3 log .......................... %s (harus tetap 7)\n', v_warm_3x) ||
    format(E'Hot Lead dengan >=3 log ...................... %s (harus tetap 4)\n', v_hot_3x) ||
    format(E'Inbound dengan >=3 log ....................... %s (tidak disentuh)\n', v_inbound_3x) ||
    format(E'In Progress ARSIP dengan >=3 log ............. %s (tidak disentuh; 6 pada 11 Okt)\n', v_arsip_in_progress) ||
    format(E'Tidak Terjangkau yang masih ber-assigned ..... %s (harus 0)\n', v_masih_dipegang) ||
    format(E'Cron schedule ................................ %s\n', coalesce(v_cron_schedule, '(job tidak ditemukan)')) ||
    format(E'Cron memanggil tandai_tidak_terjangkau ....... %s\n', v_cron_ok) ||
    format(E'Cron command:\n%s', coalesce(v_cron_command, '(job tidak ditemukan)'));

  raise exception '%', v_msg;
end;
$$;

-- Jaga-jaga: tidak pernah tercapai kalau editor berhenti di error di atas.
rollback;
