-- =====================================================================
-- 0021_gsheet_hotlead_rpc.sql — Sinkronisasi Hot Lead ke Google Sheets,
-- pola PULL terjadwal (Apps Script panggil RPC ini 2x sehari), bukan
-- trigger real-time pg_net yang dibatalkan.
-- =====================================================================
--
-- KOREKSI DARI PROMPT ASLI (diverifikasi terhadap skema live sebelum
-- dijalankan):
--   1. Kolom hasil panggilan di call_logs namanya `hasil`, BUKAN
--      `hasil_panggilan` (lihat 0003_call_outcome_datar.sql). Isinya
--      KODE enum ('MINAT', 'JANJI_TEMU', dst - lib/call-outcome/catalog.ts),
--      bukan label. Filter "Hot Lead" yang benar adalah kode dengan
--      statusKontak='Hot Lead' di catalog.ts, yaitu MINAT ('Tertarik —
--      kirim simulasi') dan JANJI_TEMU ('Janji ketemu / survey') - dua
--      label yang dipakai di prompt asli itu sendiri, cuma salah taruh
--      di kolom yang salah dan pakai teks label alih-alih kode.
--   2. Bug keamanan di validasi secret: kondisi asli
--      `v_expected_secret IS NULL OR p_secret != v_expected_secret`
--      TIDAK menangkap p_secret NULL - `p_secret != v_expected_secret`
--      hasilnya NULL kalau p_secret NULL (three-valued logic PL/pgSQL),
--      sehingga `IF ... THEN` tidak pernah TRUE dan RAISE EXCEPTION
--      dilewati begitu saja: p_secret NULL akan LOLOS validasi dan
--      membocorkan seluruh Hot Lead. Diganti pakai pengecekan eksplisit
--      p_secret IS NULL / kosong / IS DISTINCT FROM (NULL-safe).
--   3. Tambah `set search_path = public` di function SECURITY DEFINER -
--      pola yang sama dipakai notify_web_lead_submission() di
--      0017_web_lead_notify_webhook.sql, standar hardening untuk
--      SECURITY DEFINER supaya tidak bisa dieksploitasi lewat manipulasi
--      search_path pemanggil.
--   4. Kolom `status` di output diisi LABEL yang enak dibaca (persis
--      teks yang dipakai prompt asli sebagai nilai filter), bukan kode
--      mentah 'MINAT'/'JANJI_TEMU' - sheet ini dibaca tim, bukan sistem.
--
-- Tabel terpisah `integration_config` (bukan reuse `system_config` yang
-- sudah ada) SENGAJA - system_config RLS-nya "Authenticated can read"
-- (semua agent bisa baca), sedangkan secret ini harus admin-only.

-- ---------------------------------------------------------------------
-- 0. Bersihkan trigger real-time pg_net yang dibatalkan, kalau sempat
--    dijalankan dari prompt sebelumnya.
-- ---------------------------------------------------------------------
drop trigger if exists trigger_notify_hot_lead_gsheet on public.call_logs;
drop function if exists public.notify_hot_lead_to_gsheet();

-- ---------------------------------------------------------------------
-- 1. Config table untuk secret
-- ---------------------------------------------------------------------
create table if not exists public.integration_config (
  key   text primary key,
  value text not null
);

insert into public.integration_config (key, value) values
  ('gsheet_sync_secret', 'GANTI_DENGAN_SECRET_SAMA_PERSIS_DENGAN_APPS_SCRIPT')
on conflict (key) do nothing;

alter table public.integration_config enable row level security;

drop policy if exists "Admin only" on public.integration_config;
create policy "Admin only" on public.integration_config for all
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. RPC function — dipanggil Apps Script tiap sinkronisasi
-- ---------------------------------------------------------------------
create or replace function public.get_hot_leads_since(
  p_since  timestamptz,
  p_secret text
)
returns table (
  call_timestamp  timestamptz,
  nama_tele       text,
  nama_konsumen   text,
  kendaraan       text,
  status          text,
  no_hp           text,
  catatan         text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_secret text;
begin
  select value into v_expected_secret
  from public.integration_config where key = 'gsheet_sync_secret';

  if v_expected_secret is null
     or p_secret is null
     or p_secret = ''
     or p_secret is distinct from v_expected_secret
  then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    cl.timestamp,
    u.name,
    c.nama,
    trim(concat_ws(' ', c.jenis_kendaraan, c.merk_tipe, c.tahun::text)),
    case cl.hasil
      when 'MINAT' then 'Tertarik — kirim simulasi'
      when 'JANJI_TEMU' then 'Janji ketemu / survey'
      else cl.hasil
    end,
    c.no_hp,
    coalesce(cl.call_notes, '')
  from public.call_logs cl
  join public.contacts c on c.id = cl.contact_id
  join public.users u on u.id = cl.agent_id
  where cl.hasil in ('MINAT', 'JANJI_TEMU')
    and cl.timestamp > p_since
  order by cl.timestamp asc;
end;
$$;

-- Izinkan dipanggil lewat anon key (aman karena tetap divalidasi
-- secret di dalam function, bukan open access)
grant execute on function public.get_hot_leads_since(timestamptz, text) to anon;
