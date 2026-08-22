-- =====================================================================
-- 0003_call_outcome_datar.sql
-- Ratakan pohon status panggilan 4 tingkat jadi satu daftar datar.
--
-- Kolom lama TIDAK dibuang di migrasi ini. Dipetakan, dilonggarkan, lalu
-- dibiarkan sebagai cadangan sampai kamu yakin data barunya benar.
-- Ada migrasi 0004 di bagian bawah berkas ini (dikomentari) untuk membuang
-- kolom lama nanti — jalankan setelah minimal 2 minggu berjalan lancar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. PRASYARAT — tabel kepatuhan yang dipakai trigger di bagian 5.
--    Aman dijalankan ulang kalau kamu sudah membuatnya dari dokumen v2.
-- ---------------------------------------------------------------------
create table if not exists public.do_not_contact (
  no_hp        text primary key,
  alasan       text not null check (alasan in
                 ('Diminta Nasabah','Konsumen Meninggal','Nomor Salah','Keputusan Admin')),
  dicatat_oleh uuid references public.users(id),
  created_at   timestamptz not null default now()
);

alter table public.contacts
  add column if not exists consent_status text default 'Belum Ada'
    check (consent_status in ('Belum Ada','Diberikan','Ditarik')),
  add column if not exists consent_at timestamptz;

alter table public.do_not_contact enable row level security;
drop policy if exists "Admin kelola do_not_contact" on public.do_not_contact;
create policy "Admin kelola do_not_contact"
  on public.do_not_contact for all using (public.is_admin());

-- Antrean WAJIB melewati daftar ini. Tanpa baris ini, JANGAN_HUBUNGI
-- hanya jadi catatan tanpa akibat, dan kontaknya akan ditelepon lagi
-- oleh mitra berikutnya — persis yang dilarang POJK 6/2022.
comment on table public.do_not_contact is
  'Wajib dicek di assign_contacts_to_agent(). Lihat Prompt 10 di BRIEF_CLAUDE_CODE.md.';


-- ---------------------------------------------------------------------
-- 1. Kolom baru
-- ---------------------------------------------------------------------
alter table public.call_logs
  add column if not exists hasil text
    check (hasil in (
      'MINAT','JANJI_TEMU','PIKIR_PIKIR','KONFIRMASI_PASANGAN',
      'TOLAK_HARGA','TOLAK_BUTUH','TIDAK_MEMENUHI_SYARAT',
      'MINTA_TELEPON_LAIN','BUKAN_ORANGNYA',
      'TIDAK_DIANGKAT','NOMOR_SALAH','JANGAN_HUBUNGI'
    )),
  add column if not exists sub_alasan text
    check (sub_alasan in (
      'BPKB_MASIH_KREDIT','BPKB_BUKAN_ATAS_NAMA','PAJAK_MATI',
      'UNIT_TERLALU_TUA','LUAR_COVERAGE','RIWAYAT_KREDIT','LAINNYA'
    ));

comment on column public.call_logs.hasil is
  'Satu dropdown menggantikan pohon 4 tingkat. Lihat lib/call-outcome/catalog.ts.';
comment on column public.call_logs.sub_alasan is
  'Hanya untuk hasil=TIDAK_MEMENUHI_SYARAT. Kolom ini mengukur mutu database — '
  'BPKB_MASIH_KREDIT di atas 40% berarti sumber datamu salah untuk produk ini.';


-- ---------------------------------------------------------------------
-- 2. Backfill dari pohon lama — cerminan dariPohonLama() di TypeScript
-- ---------------------------------------------------------------------
update public.call_logs set
  hasil = case
    when level_3 = 'Konsumen Meninggal'                     then 'JANGAN_HUBUNGI'
    when level_3 in ('No Salah','Bad Rating')               then 'NOMOR_SALAH'
    when level_2 = 'Invalid Number'                         then 'NOMOR_SALAH'
    when level_2 = 'Uncontacted'                            then 'TIDAK_DIANGKAT'
    when level_3 = 'Unpresent' and level_4 = 'Callback'     then 'MINTA_TELEPON_LAIN'
    when level_3 = 'Unpresent' and level_4 = 'Meeting'      then 'JANJI_TEMU'
    when level_3 = 'Unpresent' and level_4 = 'Reject Front' then 'TOLAK_BUTUH'
    when level_3 = 'Unpresent'                              then 'BUKAN_ORANGNYA'
    when level_4 in ('Interest','Prospect')                 then 'MINAT'
    when level_4 = 'Unprospect' then case level_4_detail
      when 'Kendaraan Masih Kredit' then 'TIDAK_MEMENUHI_SYARAT'
      when 'Angsuran Masih Banyak'  then 'TIDAK_MEMENUHI_SYARAT'
      when 'Invalid Data'           then 'TIDAK_MEMENUHI_SYARAT'
      when 'No Coverage Area'       then 'TIDAK_MEMENUHI_SYARAT'
      when 'Pricing'                then 'TOLAK_HARGA'
      when 'Dana Cari Rendah'       then 'TOLAK_HARGA'
      when 'Service'                then 'TOLAK_HARGA'
      when 'No Need Money'          then 'TOLAK_BUTUH'
      when 'Dana Sudah Cair'        then 'TOLAK_BUTUH'
      when 'Konfirmasi Pasangan'    then 'KONFIRMASI_PASANGAN'
      when 'Masih Pikir-pikir'      then 'PIKIR_PIKIR'
      when 'Inquiry'                then 'PIKIR_PIKIR'
      else 'TIDAK_MEMENUHI_SYARAT'
    end
    else 'TIDAK_DIANGKAT'
  end,
  sub_alasan = case
    when level_4 = 'Unprospect' then case level_4_detail
      when 'Kendaraan Masih Kredit' then 'BPKB_MASIH_KREDIT'
      when 'Angsuran Masih Banyak'  then 'BPKB_MASIH_KREDIT'
      when 'Invalid Data'           then 'BPKB_BUKAN_ATAS_NAMA'
      when 'No Coverage Area'       then 'LUAR_COVERAGE'
      when 'Pricing'                then null
      when 'Dana Cari Rendah'       then null
      when 'Service'                then null
      when 'No Need Money'          then null
      when 'Dana Sudah Cair'        then null
      when 'Konfirmasi Pasangan'    then null
      when 'Masih Pikir-pikir'      then null
      when 'Inquiry'                then null
      else 'LAINNYA'
    end
    else null
  end
where hasil is null;


-- ---------------------------------------------------------------------
-- 3. Longgarkan kolom lama — baris baru tidak lagi mengisinya
-- ---------------------------------------------------------------------
alter table public.call_logs
  alter column level_1 drop not null,
  alter column level_2 drop not null;

-- Mulai sekarang `hasil` yang wajib
alter table public.call_logs
  add constraint call_logs_hasil_wajib
    check (hasil is not null or level_1 is not null) not valid;
-- 'not valid' = baris lama tidak dicek ulang. Setelah backfill di atas
-- semua baris punya `hasil`, jadi validasi bisa dijalankan:
alter table public.call_logs validate constraint call_logs_hasil_wajib;

-- Sub-alasan hanya boleh ada pada TIDAK_MEMENUHI_SYARAT, dan wajib di sana
alter table public.call_logs
  add constraint call_logs_sub_alasan_konsisten check (
    (hasil = 'TIDAK_MEMENUHI_SYARAT' and sub_alasan is not null)
    or (hasil <> 'TIDAK_MEMENUHI_SYARAT' and sub_alasan is null)
    or hasil is null
  ) not valid;


-- ---------------------------------------------------------------------
-- 4. status_call kontak — tambah 'Warm' dan 'Closed'
-- ---------------------------------------------------------------------
alter table public.contacts drop constraint if exists contacts_status_call_check;
alter table public.contacts add constraint contacts_status_call_check
  check (status_call in (
    'Uncalled','In Progress','Contacted','Hot Lead','Warm',
    'Closed','Submitted','Rejected','Invalid','Duplicate'
  ));

-- Kontak yang dulu 'Contacted' sebenarnya belum tentu pernah diajak bicara.
-- Biarkan apa adanya — jangan menulis ulang sejarah, cukup pastikan
-- status baru dipakai mulai sekarang.


-- ---------------------------------------------------------------------
-- 5. JANGAN_HUBUNGI otomatis masuk do_not_contact  (POJK 6/2022)
-- ---------------------------------------------------------------------
create or replace function public.tangani_jangan_hubungi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_hp text;
begin
  if new.hasil <> 'JANGAN_HUBUNGI' then return new; end if;

  select no_hp into v_hp from public.contacts where id = new.contact_id;
  if v_hp is null then return new; end if;

  insert into public.do_not_contact (no_hp, alasan, dicatat_oleh)
  values (v_hp, 'Diminta Nasabah', new.agent_id)
  on conflict (no_hp) do nothing;

  update public.contacts
     set status_call = 'Invalid', consent_status = 'Ditarik', consent_at = now()
   where id = new.contact_id;

  return new;
end;
$$;

drop trigger if exists trg_jangan_hubungi on public.call_logs;
create trigger trg_jangan_hubungi
  after insert on public.call_logs
  for each row execute function public.tangani_jangan_hubungi();


-- ---------------------------------------------------------------------
-- 6. Definisi RPC yang BENAR
-- ---------------------------------------------------------------------
-- Yang lama: level_1='CONNECTED' / total  <- menghitung nada sibuk & mailbox
--            sebagai "tersambung", sehingga angkanya selalu terlihat bagus.
-- Yang baru: hanya hasil yang benar-benar berarti bicara dengan orangnya.

create or replace function public.adalah_rpc(p_hasil text)
returns boolean language sql immutable as $$
  select p_hasil in (
    'MINAT','JANJI_TEMU','PIKIR_PIKIR','KONFIRMASI_PASANGAN',
    'TOLAK_HARGA','TOLAK_BUTUH','TIDAK_MEMENUHI_SYARAT'
  )
$$;

create or replace view public.v_rpc_harian as
select
  agent_id,
  timestamp::date                                       as tanggal,
  count(*)                                              as total_dial,
  count(*) filter (where public.adalah_rpc(hasil))      as rpc,
  round(count(*) filter (where public.adalah_rpc(hasil))::numeric
        / nullif(count(*), 0) * 100, 2)                 as rpc_rate_pct,
  count(*) filter (where hasil in ('MINAT','JANJI_TEMU')) as hot_lead
from public.call_logs
where hasil is not null
group by agent_id, timestamp::date;

comment on view public.v_rpc_harian is
  'Target realistis RPC untuk data dingin: 12-18%. Target 30% di PRD lama '
  'berasal dari definisi yang keliru dan tidak bisa dicapai dengan definisi ini.';


-- ---------------------------------------------------------------------
-- 7. Mutu database — laporan yang paling menentukan nasib bisnis
-- ---------------------------------------------------------------------
create or replace view public.v_mutu_database as
with dasar as (
  select cl.sub_alasan, c.batch_id
  from public.call_logs cl
  join public.contacts c on c.id = cl.contact_id
  where cl.hasil = 'TIDAK_MEMENUHI_SYARAT'
),
total as (
  select c.batch_id, count(*) as dihubungi
  from public.call_logs cl
  join public.contacts c on c.id = cl.contact_id
  where public.adalah_rpc(cl.hasil)
  group by c.batch_id
)
select
  b.id                      as batch_id,
  b.source_desc,
  t.dihubungi,
  count(*) filter (where d.sub_alasan = 'BPKB_MASIH_KREDIT')      as bpkb_masih_kredit,
  round(count(*) filter (where d.sub_alasan = 'BPKB_MASIH_KREDIT')::numeric
        / nullif(t.dihubungi, 0) * 100, 1)                        as pct_bpkb_kredit,
  count(*) filter (where d.sub_alasan = 'BPKB_BUKAN_ATAS_NAMA')   as bukan_atas_nama,
  count(*) filter (where d.sub_alasan = 'PAJAK_MATI')             as pajak_mati,
  count(*) filter (where d.sub_alasan = 'LUAR_COVERAGE')          as luar_coverage,
  count(*)                                                        as total_tidak_layak
from public.data_batches b
left join total t on t.batch_id = b.id
left join dasar d on d.batch_id = b.id
group by b.id, b.source_desc, t.dihubungi;

comment on view public.v_mutu_database is
  'pct_bpkb_kredit di atas 40% = sumber data ini salah untuk produk BPKB. '
  'Periksa setelah 200 panggilan pertama tiap batch, jangan tunggu sebulan.';


-- =====================================================================
-- 0004 (JANGAN JALANKAN SEKARANG) — buang kolom pohon lama.
-- Jalankan setelah minimal 2 minggu dan setelah v_rpc_harian terlihat wajar.
-- =====================================================================
-- alter table public.call_logs
--   drop column level_1, drop column level_2,
--   drop column level_3, drop column level_4, drop column level_4_detail;
-- drop index if exists idx_call_logs_level_1_2;
