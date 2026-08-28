-- =====================================================================
-- 0017_web_lead_notify_webhook.sql — notifikasi admin untuk lead baru
-- dari mitrabertuah.com, sesuai §5.7 build spec.
--
-- Tanpa ini, lead yang masuk jam 9 malam menunggu sampai admin
-- kebetulan login (§5.7).
--
-- pg_net dipakai untuk memanggil route Next.js
-- (app/api/webhooks/lead-notify/route.ts di mitrabertuah-web) setiap ada
-- insert baru di web_lead_submissions — pola yang sama dipakai fitur
-- "Database Webhooks" bawaan Supabase Studio.
--
-- SECRET TIDAK DITARUH DI FILE INI supaya tidak ikut ter-commit ke git.
-- Setelah migrasi ini jalan, JALANKAN SEKALI SECARA MANUAL di SQL
-- Editor (bukan lewat file migrasi):
--
--   select vault.create_secret(
--     'ed03650e2a34068fe79d1958c09c04f1353d1b8ba500e4eecaf1e50592e28c61',
--     'web_lead_webhook_secret'
--   );
--
-- Nilai itu HARUS sama persis dengan LEAD_WEBHOOK_SECRET di
-- mitrabertuah-web/.env.local (dan di environment variables Vercel
-- setelah deploy).
--
-- URL tujuan webhook disimpan di system_config (bukan di-hardcode di
-- trigger) supaya bisa diarahkan ke URL sementara saat uji coba tanpa
-- perlu migrasi baru. Isi/ubah dengan:
--
--   update public.system_config
--   set value = 'https://mitrabertuah.com/api/webhooks/lead-notify'
--   where key = 'web_lead_webhook_url';
-- =====================================================================

create extension if not exists pg_net;

insert into public.system_config (key, value) values
  ('web_lead_webhook_url', 'https://mitrabertuah.com/api/webhooks/lead-notify')
on conflict (key) do nothing;

create or replace function public.notify_web_lead_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url
  from public.system_config
  where key = 'web_lead_webhook_url';

  if v_url is null or v_url = '' then
    return new; -- belum dikonfigurasi, jangan gagalkan insert
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'web_lead_webhook_secret'
  limit 1;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object(
      'submission_id', new.id,
      'contact_id', new.contact_id,
      'nama', new.nama,
      'no_hp', new.no_hp,
      'jenis_kendaraan', new.jenis_kendaraan,
      'tahun_kendaraan', new.tahun_kendaraan,
      'domisili_kota', new.domisili_kota,
      'keperluan_dana', new.keperluan_dana,
      'hasil_intake', new.hasil_intake
    )
  );

  return new;
exception when others then
  -- Gagal memanggil webhook TIDAK BOLEH menggagalkan penyimpanan lead.
  -- Insert ke web_lead_submissions sudah commit sebelum trigger AFTER
  -- ini jalan; catat saja lewat notice, jangan raise ulang.
  raise notice 'notify_web_lead_submission gagal: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_web_lead_submission on public.web_lead_submissions;
create trigger trg_notify_web_lead_submission
  after insert on public.web_lead_submissions
  for each row execute function public.notify_web_lead_submission();
