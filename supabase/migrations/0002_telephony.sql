-- =====================================================================
-- 0002_telephony.sql — Lapisan telepon FinMatch PKU
--
-- Prinsip pemisahan yang menentukan seluruh desain ini:
--
--   call_logs      = apa yang MITRA KATAKAN terjadi  (input manusia)
--   call_sessions  = apa yang SISTEM TELEPON CATAT   (bukti mesin)
--
-- Deteksi fraud lahir dari selisih keduanya. Kalau digabung jadi satu
-- tabel, tidak ada yang bisa dibandingkan dan seluruh gunanya hilang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. call_sessions — bukti dari sisi telepon
-- ---------------------------------------------------------------------
create table if not exists public.call_sessions (
  id                uuid primary key default uuid_generate_v4(),

  -- Kaitan ke input mitra. NULL = mitra menelepon tapi tidak mencatat.
  call_log_id       uuid references public.call_logs(id) on delete set null,
  contact_id        uuid references public.contacts(id) on delete set null,
  agent_id          uuid not null references public.users(id) on delete restrict,

  phone_e164        text not null,              -- '628123456789', digit saja
  started_at        timestamptz not null,
  ended_at          timestamptz,
  talk_time_detik   int check (talk_time_detik >= 0),

  outcome           text not null default 'unknown'
    check (outcome in ('answered','no_answer','busy','failed','unknown')),

  -- Dari adapter mana bukti ini datang
  source            text not null
    check (source in ('manual','gsm_log','pbx')),
  external_call_id  text,                       -- id otoritatif dari PBX

  -- Apakah ada bukti independen bahwa panggilan ini benar terjadi
  verified          boolean not null default false,
  verified_by       text check (verified_by in ('device_log','pbx','admin')),

  created_at        timestamptz not null default now()
);

create index if not exists idx_cs_agent_started on public.call_sessions(agent_id, started_at desc);
create index if not exists idx_cs_call_log      on public.call_sessions(call_log_id);
create index if not exists idx_cs_phone_started on public.call_sessions(phone_e164, started_at);

-- Satu call_log hanya boleh punya satu bukti sesi
create unique index if not exists idx_cs_one_per_log
  on public.call_sessions(call_log_id) where call_log_id is not null;

-- id PBX unik supaya webhook yang dikirim ulang tidak menggandakan baris
create unique index if not exists idx_cs_external_id
  on public.call_sessions(external_call_id) where external_call_id is not null;


-- ---------------------------------------------------------------------
-- 2. call_recordings — berkas rekaman + seberapa yakin pencocokannya
-- ---------------------------------------------------------------------
create table if not exists public.call_recordings (
  id                uuid primary key default uuid_generate_v4(),
  call_session_id   uuid references public.call_sessions(id) on delete set null,
  agent_id          uuid not null references public.users(id) on delete restrict,

  storage_path      text not null unique,       -- path di Supabase Storage
  durasi_detik      int,
  ukuran_bytes      bigint,

  -- Metadata yang dibaca dari nama berkas rekaman
  parsed_phone_e164 text,
  parsed_started_at timestamptz,

  -- Pencocokan rekaman -> sesi itu FUZZY pada opsi manual. Jangan pura-pura pasti.
  match_confidence  text not null default 'unmatched'
    check (match_confidence in ('exact','high','low','unmatched','conflict')),
  match_delta_detik int,                        -- selisih waktu ke sesi terpilih
  match_reviewed_by uuid references public.users(id),
  match_reviewed_at timestamptz,

  uploaded_at       timestamptz not null default now()
);

create index if not exists idx_cr_session    on public.call_recordings(call_session_id);
create index if not exists idx_cr_confidence on public.call_recordings(match_confidence)
  where match_confidence in ('low','unmatched','conflict');


-- ---------------------------------------------------------------------
-- 3. device_log_imports — jejak unggahan harian mitra (opsi manual)
-- ---------------------------------------------------------------------
create table if not exists public.device_log_imports (
  id                uuid primary key default uuid_generate_v4(),
  agent_id          uuid not null references public.users(id) on delete restrict,
  tanggal           date not null,

  baris_total       int not null default 0,     -- baris di CSV mentah
  baris_relevan     int not null default 0,     -- yang nomornya ada di contacts
  baris_dibuang     int not null default 0,     -- panggilan pribadi -> TIDAK disimpan
  rekaman_diunggah  int not null default 0,

  status            text not null default 'Diproses'
    check (status in ('Diproses','Selesai','Gagal')),
  catatan_error     text,
  created_at        timestamptz not null default now(),

  unique (agent_id, tanggal)
);

comment on column public.device_log_imports.baris_dibuang is
  'Panggilan yang nomornya tidak ada di contacts dibuang saat impor dan tidak pernah disimpan. '
  'Ini sekaligus minimisasi data sesuai UU PDP — call log pribadi mitra bukan urusan sistem ini.';


-- ---------------------------------------------------------------------
-- 4. reconciliation_daily — hasil adu "kata mitra" vs "kata perangkat"
-- ---------------------------------------------------------------------
create table if not exists public.reconciliation_daily (
  id                    uuid primary key default uuid_generate_v4(),
  agent_id              uuid not null references public.users(id) on delete restrict,
  tanggal               date not null,

  crm_dicatat           int not null default 0,  -- baris call_logs hari itu
  perangkat_tercatat    int not null default 0,  -- panggilan relevan di call log HP
  cocok                 int not null default 0,

  -- INI angka yang kamu lihat dari Jakarta setiap pagi
  diduga_fiktif         int not null default 0,  -- dicatat di CRM, tidak ada di HP
  tidak_dicatat         int not null default 0,  -- ada di HP, tidak dicatat di CRM
  selisih_durasi_detik  int not null default 0,

  skor_integritas       numeric(5,2),            -- cocok / crm_dicatat * 100
  status                text not null default 'Normal'
    check (status in ('Normal','Perlu Ditinjau','Bermasalah')),

  created_at            timestamptz not null default now(),
  unique (agent_id, tanggal)
);

create index if not exists idx_rd_status on public.reconciliation_daily(tanggal desc, status);


-- ---------------------------------------------------------------------
-- 5. call_logs — kolom bukti. Durasi TIDAK BOLEH diketik mitra.
-- ---------------------------------------------------------------------
alter table public.call_logs
  add column if not exists sumber_durasi text not null default 'manual'
    check (sumber_durasi in ('manual','gsm_log','pbx'));

comment on column public.call_logs.call_duration is
  'PERINGATAN: pada sumber_durasi=manual angka ini dilaporkan sendiri oleh mitra dan '
  'TIDAK BOLEH dipakai untuk KPI atau deteksi fraud. Pakai call_sessions.talk_time_detik.';


-- ---------------------------------------------------------------------
-- 6. Konfigurasi provider — supaya ganti adapter tidak perlu deploy ulang
-- ---------------------------------------------------------------------
insert into public.system_config (key, value) values
  ('telephony_provider',        'manual'),   -- manual | gsm_log | pbx
  ('telephony_match_toleransi', '120'),      -- detik, jendela cocokkan rekaman
  ('telephony_upload_deadline', '21:00'),    -- batas unggah harian WIB
  ('telephony_retensi_hari',    '90')        -- hapus rekaman setelah N hari
on conflict (key) do nothing;


-- ---------------------------------------------------------------------
-- 7. View: papan integritas harian — lima angka untuk HP-mu di Jakarta
-- ---------------------------------------------------------------------
create or replace view public.v_papan_harian as
select
  u.id                                              as agent_id,
  u.name                                            as nama,
  count(cl.id)                                      as dicatat_crm,
  count(cs.id) filter (where cs.verified)            as terverifikasi,
  coalesce(sum(cs.talk_time_detik), 0) / 60          as menit_bicara,
  count(*) filter (where cl.level_3 = 'Present')     as rpc,
  count(*) filter (where cl.level_4 in ('Interest','Prospect')) as hot_lead,
  r.diduga_fiktif,
  r.skor_integritas,
  r.status                                          as status_integritas
from public.users u
left join public.call_logs cl
       on cl.agent_id = u.id and cl.timestamp::date = current_date
left join public.call_sessions cs
       on cs.call_log_id = cl.id
left join public.reconciliation_daily r
       on r.agent_id = u.id and r.tanggal = current_date
where u.role = 'agent'
group by u.id, u.name, r.diduga_fiktif, r.skor_integritas, r.status;


-- ---------------------------------------------------------------------
-- 8. RLS — mitra tidak boleh melihat, apalagi mengubah, bukti tentang dirinya
-- ---------------------------------------------------------------------
alter table public.call_sessions        enable row level security;
alter table public.call_recordings      enable row level security;
alter table public.device_log_imports   enable row level security;
alter table public.reconciliation_daily enable row level security;

-- Pakai helper is_admin() dari perbaikan RLS rekursif (lihat dokumen v2 Lampiran 10)
create policy "Admin kelola call_sessions"        on public.call_sessions        for all using (public.is_admin());
create policy "Admin kelola call_recordings"      on public.call_recordings      for all using (public.is_admin());
create policy "Admin kelola device_log_imports"   on public.device_log_imports   for all using (public.is_admin());
create policy "Admin kelola reconciliation_daily" on public.reconciliation_daily for all using (public.is_admin());

-- Mitra hanya boleh melihat ringkasan unggahannya sendiri, supaya tahu sudah masuk apa belum
create policy "Mitra lihat impor sendiri" on public.device_log_imports
  for select using (auth.uid() = agent_id);

-- Catatan: TIDAK ADA policy yang memberi mitra akses ke call_sessions,
-- call_recordings, atau reconciliation_daily. Bukti tentang seseorang
-- tidak boleh bisa diedit oleh orang itu sendiri.
