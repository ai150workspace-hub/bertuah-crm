-- =====================================================================
-- 0013_web_rate_limit.sql — rate limit untuk submit lead dari
-- mitrabertuah.com, sesuai §9 build spec.
--
-- KENAPA TABEL, BUKAN MEMORY/EDGE CONFIG: Vercel stateless multi-instance.
-- Counter in-memory hilang tiap cold start dan tidak dibagi antar
-- instance — lihat Aturan Mutlak #11 di prompt build. Tabel ini
-- satu-satunya tempat penghitung dibagi lintas instance serverless.
--
-- Window kasar per jam (bukan sliding window) — cukup untuk ambang
-- "maks 3 submit/jam" di §9, dan jauh lebih sederhana daripada sliding
-- window untuk kasus penggunaan lead form (bukan API publik bervolume
-- tinggi).
-- =====================================================================

create table public.rate_limit (
  id           uuid primary key default uuid_generate_v4(),
  -- Contoh isi: 'lead-submit:' || ip_hash. Tidak menyimpan IP mentah —
  -- konsisten dengan web_lead_submissions.ip_hash.
  bucket_key   text not null,
  window_start timestamptz not null,
  count        int not null default 1,
  created_at   timestamptz not null default now()
);

create unique index idx_rate_limit_bucket_window
  on public.rate_limit(bucket_key, window_start);

alter table public.rate_limit enable row level security;

-- Tidak ada policy untuk anon maupun authenticated. Sengaja — hanya
-- diakses lewat check_rate_limit() (security definer), dipanggil server
-- action dengan service role key, sama seperti intake_web_lead().
create policy "Admin lihat rate_limit"
  on public.rate_limit for select
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Cek-dan-tambah atomik. Kembalikan true kalau submit ini masih di
-- bawah batas, false kalau sudah melebihi.
-- ---------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_max_per_window int,
  p_window_minutes int default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count        int;
begin
  -- Window dibulatkan ke kelipatan p_window_minutes sejak epoch, supaya
  -- semua submit dalam jam yang sama jatuh ke baris yang sama.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60)
  );

  insert into public.rate_limit (bucket_key, window_start, count)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set count = rate_limit.count + 1
  returning count into v_count;

  return v_count <= p_max_per_window;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon;

-- ---------------------------------------------------------------------
-- Rumah tangga: baris lebih tua dari 2 hari tidak perlu disimpan.
-- Dijalankan manual atau lewat cron kalau nanti mau dijadwalkan —
-- sengaja tidak di-cron.schedule di sini supaya migrasi ini tidak
-- menambah beban operasional CRM tanpa keputusan eksplisit.
-- ---------------------------------------------------------------------
comment on table public.rate_limit is
  'Baris lebih tua dari 2 hari aman dihapus berkala. Belum di-cron — '
  'lihat komentar migrasi 0013.';
