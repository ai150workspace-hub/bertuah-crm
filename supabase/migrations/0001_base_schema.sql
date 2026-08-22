-- =====================================================================
-- 0001_base_schema.sql — Bertuah CRM base schema
--
-- Diturunkan dari FinMatch_PKU_PRD.md (bukan PRD_v1.0.md) karena
-- migrasi 0002/0003 dan lib/telephony, lib/call-outcome dibangun
-- mengikuti struktur di dokumen itu: assignment langsung di
-- contacts.assigned_to (bukan tabel lead_assignments terpisah),
-- data_batches, system_config, leasing_partner sebagai text bebas
-- di applications.
--
-- WAJIB dijalankan SEBELUM 0002 dan 0003 — keduanya mengasumsikan
-- tabel-tabel ini sudah ada.
-- =====================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- Helper: auto-update updated_at
-- ---------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- 1. users — extends auth.users
--    (dibuat SEBELUM is_admin() di bawah — fungsi `language sql`
--    di-parse & divalidasi terhadap katalog saat CREATE, bukan saat
--    dipanggil, jadi tabel yang direferensikan wajib sudah ada.)
-- ---------------------------------------------------------------------
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null unique,
  role          text not null check (role in ('admin', 'agent')),
  phone         text,
  is_active     boolean not null default true,
  target_pencairan_bulanan  bigint default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------
-- Helper: public.is_admin() — security definer, HINDARI infinite
-- recursion. Policy RLS yang query public.users dari DALAM policy di
-- tabel public.users sendiri akan memicu rekursi tak berhingga; fungsi
-- security definer ini memutus rantai itu. SEMUA policy "admin full
-- access" di migrasi ini dan di 0002/0003 memakai fungsi ini, bukan
-- subquery inline ke public.users.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from public.users
                  where id = auth.uid() and role = 'admin') $$;

alter table public.users enable row level security;

create policy "Users can view own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Admin can view all users"
  on public.users for select
  using (public.is_admin());

create policy "Admin can manage all users"
  on public.users for all
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 2. contacts
-- ---------------------------------------------------------------------
create table public.contacts (
  id                uuid primary key default uuid_generate_v4(),

  nama              text not null,
  no_hp             text not null,
  no_hp_alt         text,

  jenis_kendaraan   text not null check (jenis_kendaraan in ('Mobil', 'Motor')),
  merk_tipe         text,
  tahun             int check (tahun between 1990 and 2030),
  nomor_polisi      text,

  domisili          text,
  kelurahan         text,
  kecamatan         text,
  kota              text default 'Pekanbaru',

  status_pajak      text check (status_pajak in ('Hidup', 'Mati', 'Tidak Tahu')),
  status_kredit_kendaraan text check (status_kredit_kendaraan in ('Lunas', 'Masih Kredit', 'Tidak Tahu')),

  status_call       text not null default 'Uncalled'
    check (status_call in (
      'Uncalled', 'In Progress', 'Contacted', 'Hot Lead',
      'Submitted', 'Rejected', 'Invalid', 'Duplicate'
    )),
  status_prospek    text check (status_prospek in (
    'Interest', 'Prospect', 'Unprospect', 'Callback', 'Meeting', 'Reject Front', 'Others'
  )),

  assigned_to       uuid references public.users(id) on delete set null,
  assigned_at       timestamptz,

  source            text default 'Insurance DB',
  batch_id          uuid,
  notes             text,
  tags              text[],

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Catatan: status_call diperluas dengan 'Warm'/'Closed' di 0003 (lihat
-- alter constraint di sana). check di atas sengaja apa adanya sesuai
-- PRD supaya migrasi berikutnya bisa terlihat sebagai perubahan nyata.

create index idx_contacts_assigned_to on public.contacts(assigned_to);
create index idx_contacts_status_call on public.contacts(status_call);
create index idx_contacts_no_hp on public.contacts(no_hp);
create index idx_contacts_batch_id on public.contacts(batch_id);
create index idx_contacts_jenis_kendaraan on public.contacts(jenis_kendaraan);

create unique index idx_contacts_no_hp_unique on public.contacts(no_hp)
  where status_call != 'Duplicate';

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.handle_updated_at();

alter table public.contacts enable row level security;

create policy "Agent can view own assigned contacts"
  on public.contacts for select
  using (auth.uid() = assigned_to or public.is_admin());

create policy "Agent can update own assigned contacts"
  on public.contacts for update
  using (auth.uid() = assigned_to)
  with check (auth.uid() = assigned_to);

create policy "Admin full access on contacts"
  on public.contacts for all
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 3. call_logs — apa yang MITRA KATAKAN terjadi (lihat docs/TELEPHONY.md
--    untuk pasangannya, call_sessions, yang dibuat di 0002)
-- ---------------------------------------------------------------------
create table public.call_logs (
  id              uuid primary key default uuid_generate_v4(),
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  agent_id        uuid not null references public.users(id) on delete restrict,

  level_1         text not null check (level_1 in ('CONNECTED', 'UNCONNECTED')),
  level_2         text not null,
  level_3         text,
  level_4         text,
  level_4_detail  text,
  -- Kolom-kolom di atas dilonggarkan (drop not null) dan digantikan
  -- oleh `hasil`/`sub_alasan` di migrasi 0003. Dibiarkan di sini supaya
  -- urutan migrasi historis tetap benar.

  call_duration   int,
  call_notes      text,
  callback_date   timestamptz,

  simulasi_nominal        bigint,
  simulasi_tenor          int,
  simulasi_angsuran       bigint,
  wa_sent                 boolean default false,
  wa_sent_at              timestamptz,

  timestamp       timestamptz not null default now()
);

create index idx_call_logs_contact_id on public.call_logs(contact_id);
create index idx_call_logs_agent_id on public.call_logs(agent_id);
create index idx_call_logs_timestamp on public.call_logs(timestamp desc);
create index idx_call_logs_level_1_2 on public.call_logs(level_1, level_2);

alter table public.call_logs enable row level security;

create policy "Agent can view own call logs"
  on public.call_logs for select
  using (auth.uid() = agent_id or public.is_admin());

create policy "Agent can insert own call logs"
  on public.call_logs for insert
  with check (auth.uid() = agent_id);

create policy "Admin full access on call_logs"
  on public.call_logs for all
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 4. applications
-- ---------------------------------------------------------------------
create table public.applications (
  id                      uuid primary key default uuid_generate_v4(),
  contact_id              uuid not null references public.contacts(id) on delete restrict,
  agent_id                uuid not null references public.users(id) on delete restrict,

  leasing_partner         text not null,
  leasing_contact_name    text,
  leasing_contact_phone   text,

  nominal_pengajuan       bigint not null,
  nominal_pencairan       bigint,
  tenor_bulan             int,
  angsuran_per_bulan      bigint,

  komisi_pku_percent      numeric(5,2) not null default 5.00,
  nominal_komisi_pku      bigint generated always as (
    case when nominal_pencairan is not null
      then (nominal_pencairan * komisi_pku_percent / 100)::bigint
      else null
    end
  ) stored,

  status_aplikasi         text not null default 'Draft'
    check (status_aplikasi in (
      'Draft', 'Sent to Leasing', 'Survey', 'Approved', 'Disbursed', 'Rejected'
    )),
  rejection_reason        text,

  date_submitted          timestamptz,
  date_survey             date,
  date_approved           date,
  date_disbursed          date,

  dokumen_ktp             text,
  dokumen_bpkb            text,
  dokumen_stnk            text,
  dokumen_lainnya         text[],

  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_applications_agent_id on public.applications(agent_id);
create index idx_applications_contact_id on public.applications(contact_id);
create index idx_applications_status on public.applications(status_aplikasi);
create index idx_applications_date_disbursed on public.applications(date_disbursed);

create trigger applications_updated_at
  before update on public.applications
  for each row execute function public.handle_updated_at();

alter table public.applications enable row level security;

create policy "Agent can view own applications"
  on public.applications for select
  using (auth.uid() = agent_id or public.is_admin());

create policy "Agent can insert own applications"
  on public.applications for insert
  with check (auth.uid() = agent_id);

create policy "Agent can update own applications"
  on public.applications for update
  using (auth.uid() = agent_id)
  with check (auth.uid() = agent_id);

create policy "Admin full access on applications"
  on public.applications for all
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 5. data_batches — jejak upload CSV admin
-- ---------------------------------------------------------------------
create table public.data_batches (
  id            uuid primary key default uuid_generate_v4(),
  uploaded_by   uuid not null references public.users(id),
  filename      text not null,
  total_rows    int,
  imported_rows int,
  duplicate_rows int,
  error_rows    int,
  source_desc   text,
  status        text default 'Processing'
    check (status in ('Processing', 'Completed', 'Failed')),
  created_at    timestamptz not null default now()
);

alter table public.contacts
  add constraint contacts_batch_id_fkey
  foreign key (batch_id) references public.data_batches(id);

alter table public.data_batches enable row level security;

create policy "Admin only on data_batches"
  on public.data_batches for all
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 6. leasing_partners — daftar referensi, TIDAK di-hardcode di kode
-- ---------------------------------------------------------------------
create table public.leasing_partners (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null unique,
  pic_name      text,
  pic_phone     text,
  pic_email     text,
  coverage_area text[],
  notes         text,
  is_active     boolean default true,
  created_at    timestamptz not null default now()
);

insert into public.leasing_partners (name, is_active) values
  ('Adira Finance', true),
  ('ACC (Astra Credit Companies)', true),
  ('FIF Group', true),
  ('BFI Finance', true),
  ('Mandiri Utama Finance', true),
  ('Mega Finance', true),
  ('BAF (Bussan Auto Finance)', true),
  ('MUFG Finance', true);

alter table public.leasing_partners enable row level security;

create policy "All authenticated users can view leasing partners"
  on public.leasing_partners for select
  using (auth.role() = 'authenticated');

create policy "Admin can manage leasing partners"
  on public.leasing_partners for all
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 7. system_config — dipakai migrasi 0002 (telephony_provider dst.)
-- ---------------------------------------------------------------------
create table public.system_config (
  key   text primary key,
  value text not null,
  updated_at timestamptz default now()
);

insert into public.system_config (key, value) values
  ('drip_queue_size', '15'),
  ('drip_queue_max_uncalled_threshold', '10')
on conflict (key) do nothing;

alter table public.system_config enable row level security;

create policy "Authenticated can read system_config"
  on public.system_config for select
  using (auth.role() = 'authenticated');

create policy "Admin can manage system_config"
  on public.system_config for all
  using (public.is_admin());


-- ---------------------------------------------------------------------
-- 8. Drip queue — assignment atomic, FOR UPDATE SKIP LOCKED
-- ---------------------------------------------------------------------
create or replace function public.assign_contacts_to_agent(
  p_agent_id uuid,
  p_batch_size int default 15
)
returns setof public.contacts
language plpgsql
security definer
as $$
declare
  v_contact_ids uuid[];
begin
  select array_agg(id) into v_contact_ids
  from (
    select id from public.contacts
    where status_call = 'Uncalled'
      and assigned_to is null
    order by created_at asc
    limit p_batch_size
    for update skip locked
  ) sub;

  if v_contact_ids is null or array_length(v_contact_ids, 1) = 0 then
    return;
  end if;

  update public.contacts
  set
    assigned_to = p_agent_id,
    assigned_at = now()
  where id = any(v_contact_ids);

  return query
  select * from public.contacts
  where id = any(v_contact_ids);
end;
$$;
-- Catatan: filter do_not_contact + consent_status ditambahkan di 0003
-- (lihat Prompt 10 di docs/TELEPHONY.md) karena kedua kolom itu belum
-- ada sampai migrasi itu jalan.


-- ---------------------------------------------------------------------
-- 9. Views ringkas
-- ---------------------------------------------------------------------
create or replace view public.v_agent_monthly_performance as
select
  u.id as agent_id,
  u.name as agent_name,
  date_trunc('month', a.date_disbursed) as bulan,
  count(a.id) filter (where a.status_aplikasi = 'Disbursed') as total_disbursed_count,
  coalesce(sum(a.nominal_pencairan) filter (where a.status_aplikasi = 'Disbursed'), 0) as total_nominal_pencairan,
  coalesce(sum(a.nominal_komisi_pku) filter (where a.status_aplikasi = 'Disbursed'), 0) as total_komisi_pku,
  count(cl.id) as total_calls,
  count(cl.id) filter (where cl.level_1 = 'CONNECTED') as total_connected
from public.users u
left join public.applications a on a.agent_id = u.id
left join public.call_logs cl on cl.agent_id = u.id
  and date_trunc('month', cl.timestamp) = date_trunc('month', a.date_disbursed)
where u.role = 'agent'
group by u.id, u.name, date_trunc('month', a.date_disbursed);
-- Deprecated setelah 0003 — pakai v_rpc_harian. Dibiarkan hidup untuk
-- kompatibilitas mundur, lihat catatan di migrasi itu.

create or replace view public.v_pipeline_summary as
select
  status_aplikasi,
  count(*) as total_aplikasi,
  sum(nominal_pengajuan) as total_nominal_pengajuan,
  sum(nominal_pencairan) as total_nominal_pencairan,
  sum(nominal_komisi_pku) as total_komisi_pku
from public.applications
group by status_aplikasi;
