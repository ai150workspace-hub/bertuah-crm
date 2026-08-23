-- =====================================================================
-- 0009_auto_reshuffle_cron.sql — Auto reshuffle kontak stale via pg_cron
-- =====================================================================
-- Kontak berstatus Uncalled yang sudah ter-assign >= 5 hari tanpa
-- activity dilepas otomatis ke pool (assigned_to/assigned_at = NULL),
-- dengan catatan ditambahkan ke kolom notes. Job jalan tiap hari
-- jam 06:00 WIB (23:00 UTC). Tidak ada kode Next.js untuk fitur ini.

create extension if not exists pg_cron;

select cron.schedule(
  'auto-reshuffle-stale-contacts',
  '0 23 * * *',
  $$
  update public.contacts
  set
    assigned_to = null,
    assigned_at = null,
    notes = coalesce(notes, '') ||
      E'\n[Auto-reshuffle ' || now()::date || ': tidak ada activity 5 hari]'
  where
    status_call = 'Uncalled'
    and assigned_to is not null
    and assigned_at <= now() - interval '5 days';
  $$
);

-- Cek status job: select * from cron.job;
-- Cek history eksekusi: select * from cron.job_run_details order by start_time desc limit 20;
