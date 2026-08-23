-- =====================================================================
-- 0008_incentive_snapshots.sql — kunci hasil kalkulasi insentif per bulan
--
-- Tanpa ini, "Kunci Bulan Ini" tidak ada artinya: angka yang ditampilkan
-- di /admin/incentives selalu dihitung ulang live dari applications, jadi
-- kalau data aplikasi berubah belakangan (koreksi, dsb), gajian yang
-- sudah "final" ikut berubah diam-diam.
-- =====================================================================

create table public.incentive_snapshots (
  id                    uuid primary key default uuid_generate_v4(),
  agent_id              uuid not null references public.users(id) on delete restrict,
  periode_bulan         int not null check (periode_bulan between 1 and 12),
  periode_tahun         int not null check (periode_tahun between 2020 and 2100),

  total_pencairan       bigint not null default 0,
  total_komisi_harian   bigint not null default 0,
  bonus_bulanan         bigint not null default 0,
  take_home             bigint not null default 0,
  revenue_pku           bigint not null default 0,
  net_pku               bigint not null default 0,
  margin_pku_pct        numeric(6,2),
  tier_label            text,

  locked_by             uuid references public.users(id),
  locked_at             timestamptz not null default now(),

  unique (agent_id, periode_bulan, periode_tahun)
);

create index idx_incentive_snapshots_periode
  on public.incentive_snapshots(periode_tahun, periode_bulan);

alter table public.incentive_snapshots enable row level security;

create policy "Admin full access on incentive_snapshots"
  on public.incentive_snapshots for all
  using (public.is_admin());
