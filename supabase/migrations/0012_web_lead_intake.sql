-- =====================================================================
-- 0012_web_lead_intake.sql — jalur masuk lead dari mitrabertuah.com
--
-- Prinsip:
--   1. Setiap submit tercatat, tanpa syarat, di web_lead_submissions.
--   2. contacts hanya disentuh untuk orang yang benar-benar baru.
--   3. anon tidak punya hak apa pun. Semua lewat security definer.
--
-- Referensi: MITRABERTUAH_BUILD_SPEC_v0.3.md §5.3-§5.5.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. status_call baru: 'Inbound'
--    Constraint terkini didefinisikan di 0003 bagian 4.
-- ---------------------------------------------------------------------
alter table public.contacts drop constraint if exists contacts_status_call_check;
alter table public.contacts add constraint contacts_status_call_check
  check (status_call in (
    'Uncalled','In Progress','Contacted','Hot Lead','Warm',
    'Closed','Submitted','Rejected','Invalid','Duplicate',
    'Inbound'
  ));

comment on column public.contacts.status_call is
  '''Inbound'' = lead dari website, mengisi form sendiri. SENGAJA tidak '
  'memakai ''Uncalled'' supaya tidak tersedot assign_contacts_to_agent(), '
  'yang menyeleksi status_call = ''Uncalled''. Lihat 0011 PRIORITAS 3.';

-- ---------------------------------------------------------------------
-- 2. Tabel submission
-- ---------------------------------------------------------------------
create table public.web_lead_submissions (
  id                      uuid primary key default uuid_generate_v4(),
  contact_id              uuid references public.contacts(id) on delete set null,

  nama                    text not null,
  no_hp                   text not null,          -- format lokal '0812...'
  no_hp_raw               text not null,
  jenis_kendaraan         text not null check (jenis_kendaraan in ('Mobil','Motor')),
  merk_tipe               text,
  tahun_kendaraan         int check (tahun_kendaraan between 1990 and 2030),
  domisili_kota           text not null,
  kecamatan               text,
  keperluan_dana          text,
  catatan                 text,
  estimasi_nilai_kendaraan bigint,
  tenor_diminta_bulan     int,

  utm_source              text,
  utm_medium              text,
  utm_campaign            text,
  utm_content             text,
  utm_term                text,
  gclid                   text,
  fbclid                  text,
  landing_page            text,
  referrer                text,
  user_agent              text,

  consent_given           boolean not null,
  consent_text_version    text not null,
  consent_at              timestamptz not null default now(),
  ip_hash                 text,

  idempotency_key         text unique,
  hasil_intake            text not null check (hasil_intake in (
                            'kontak_baru','cocok_kontak_lama','tertahan_dnc'
                          )),
  sudah_ditinjau_admin    boolean not null default false,
  created_at              timestamptz not null default now()
);

create index idx_wls_no_hp        on public.web_lead_submissions(no_hp);
create index idx_wls_contact_id   on public.web_lead_submissions(contact_id);
create index idx_wls_created_at   on public.web_lead_submissions(created_at desc);
create index idx_wls_belum_tinjau on public.web_lead_submissions(sudah_ditinjau_admin)
  where sudah_ditinjau_admin = false;

alter table public.web_lead_submissions enable row level security;

-- Tidak ada policy untuk anon. Sengaja — semua penulisan lewat
-- intake_web_lead() (security definer), dipanggil server action dengan
-- service role key. Lihat §5.1 spec.
create policy "Admin full access web_lead_submissions"
  on public.web_lead_submissions for all
  using (public.is_admin());

create policy "Agent lihat submission kontaknya sendiri"
  on public.web_lead_submissions for select
  using (
    exists (
      select 1 from public.contacts c
      where c.id = web_lead_submissions.contact_id
        and c.assigned_to = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 3. Kolom atribusi di contacts
-- ---------------------------------------------------------------------
alter table public.contacts
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists landing_page   text,
  add column if not exists keperluan_dana text;

-- ---------------------------------------------------------------------
-- 4. Kait fase berikutnya — murah sekarang, mahal nanti
-- ---------------------------------------------------------------------
alter table public.contacts
  add column if not exists tenant_id  uuid,
  add column if not exists partner_id uuid;

alter table public.web_lead_submissions
  add column if not exists tenant_id  uuid,
  add column if not exists partner_id uuid;

-- ---------------------------------------------------------------------
-- 5. Fungsi intake — satu-satunya jalur tulis yang dipakai landing page
-- ---------------------------------------------------------------------
create or replace function public.intake_web_lead(p jsonb)
returns table (submission_id uuid, contact_id uuid, hasil text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hp      text;
  v_contact uuid;
  v_hasil   text;
  v_sub     uuid;
begin
  -- Normalisasi ke format lokal '0812...', SAMA dengan
  -- lib/import/phone-local.ts. Bukan format '628...' milik telephony.
  v_hp := regexp_replace(coalesce(p->>'no_hp',''), '\D', '', 'g');
  if v_hp like '620%'   then v_hp := '0' || substr(v_hp, 4);
  elsif v_hp like '62%' then v_hp := '0' || substr(v_hp, 3);
  elsif v_hp like '8%'  then v_hp := '0' || v_hp;
  end if;

  if v_hp !~ '^0\d{9,13}$' then
    raise exception 'Nomor HP tidak valid';
  end if;

  -- Daftar jangan-hubungi: tetap dicatat, tapi tidak dibuatkan kontak.
  -- Orang yang mengisi form sendiri boleh dianggap memberi persetujuan
  -- baru, TAPI keputusan itu milik admin, bukan otomatis.
  if exists (select 1 from public.do_not_contact d where d.no_hp = v_hp) then
    v_hasil := 'tertahan_dnc';
    v_contact := null;
  else
    select id into v_contact
    from public.contacts
    where no_hp = v_hp and status_call <> 'Duplicate'
    limit 1;

    if v_contact is null then
      insert into public.contacts (
        nama, no_hp, jenis_kendaraan, merk_tipe, tahun,
        kota, kecamatan, status_call, assigned_to,
        source, consent_status, consent_at,
        utm_source, utm_medium, utm_campaign, landing_page,
        keperluan_dana, notes
      ) values (
        p->>'nama', v_hp, p->>'jenis_kendaraan', p->>'merk_tipe',
        nullif(p->>'tahun_kendaraan','')::int,
        coalesce(p->>'domisili_kota','Pekanbaru'), p->>'kecamatan',
        'Inbound', null,
        'Website Organik', 'Diberikan', now(),
        p->>'utm_source', p->>'utm_medium', p->>'utm_campaign',
        p->>'landing_page', p->>'keperluan_dana', p->>'catatan'
      )
      returning id into v_contact;
      v_hasil := 'kontak_baru';
    else
      v_hasil := 'cocok_kontak_lama';
      -- Kontak lama TIDAK ditimpa. Tidak mengubah status_call,
      -- tidak mengubah assigned_to, tidak menimpa notes.
      update public.contacts
      set consent_status = 'Diberikan', consent_at = now()
      where id = v_contact and consent_status <> 'Ditarik';
    end if;
  end if;

  insert into public.web_lead_submissions (
    contact_id, nama, no_hp, no_hp_raw, jenis_kendaraan, merk_tipe,
    tahun_kendaraan, domisili_kota, kecamatan, keperluan_dana, catatan,
    estimasi_nilai_kendaraan, tenor_diminta_bulan,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    gclid, fbclid, landing_page, referrer, user_agent,
    consent_given, consent_text_version, ip_hash,
    idempotency_key, hasil_intake
  ) values (
    v_contact, p->>'nama', v_hp, p->>'no_hp', p->>'jenis_kendaraan',
    p->>'merk_tipe', nullif(p->>'tahun_kendaraan','')::int,
    coalesce(p->>'domisili_kota','Pekanbaru'), p->>'kecamatan',
    p->>'keperluan_dana', p->>'catatan',
    nullif(p->>'estimasi_nilai_kendaraan','')::bigint,
    nullif(p->>'tenor_diminta_bulan','')::int,
    p->>'utm_source', p->>'utm_medium', p->>'utm_campaign',
    p->>'utm_content', p->>'utm_term',
    p->>'gclid', p->>'fbclid', p->>'landing_page',
    p->>'referrer', p->>'user_agent',
    (p->>'consent_given')::boolean, p->>'consent_text_version', p->>'ip_hash',
    p->>'idempotency_key', v_hasil
  )
  on conflict (idempotency_key) do nothing
  returning id into v_sub;

  return query select v_sub, v_contact, v_hasil;
end;
$$;

revoke all on function public.intake_web_lead(jsonb) from public, anon;
