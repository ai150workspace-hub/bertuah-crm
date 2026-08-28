-- =====================================================================
-- 0019_hapus_data_pribadi.sql — mekanisme penghapusan data atas
-- permintaan pemilik data, sesuai UU PDP.
--
-- Sumber: PROMPT_PRIVASI_mitrabertuah.md Langkah 4 (C:\CRM). Kebijakan
-- privasi situs (content/kebijakan-privasi.ts di repo mitrabertuah-web,
-- bagian 7-8) menjanjikan hak ini — migrasi ini yang menepatinya.
--
-- Prinsip (persis instruksi sumber, jangan diubah tanpa alasan kuat):
--   1. ANONIMKAN, jangan hard-delete baris yang dipakai laporan agregat.
--      call_logs.contact_id REFERENCES contacts(id) ON DELETE CASCADE
--      dan applications.contact_id ON DELETE RESTRICT (lihat 0001) —
--      hard-delete contacts akan menghancurkan riwayat panggilan/deal
--      yang jadi dasar statistik agregat, atau gagal total kalau ada
--      applications terkait. Anonimisasi menghindari keduanya sekaligus.
--   2. JANGAN PERNAH hapus baris do_not_contact — sebaliknya, TAMBAHKAN
--      nomor itu ke sana kalau belum ada. Menghapus catatan jangan-
--      hubungi membuat nomor itu bisa masuk lagi lewat impor berikutnya
--      dan ditelepon ulang — kebalikan dari yang diminta pemilik data.
-- =====================================================================

create or replace function public.hapus_data_pribadi(p_no_hp text)
returns table (
  contacts_dianonimkan       int,
  submissions_dianonimkan    int,
  ditambahkan_ke_dnc         boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hp                text;
  v_contacts_count    int := 0;
  v_submissions_count int := 0;
  v_added_to_dnc      boolean := false;
begin
  -- Normalisasi ke format lokal '0812...' — SAMA dengan intake_web_lead()
  -- (migrasi 0012) dan lib/phone.ts di mitrabertuah-web. Format berbeda
  -- untuk nomor yang sama akan membuat baris lolos tak teranonimkan.
  v_hp := regexp_replace(coalesce(p_no_hp, ''), '\D', '', 'g');
  if v_hp like '620%'   then v_hp := '0' || substr(v_hp, 4);
  elsif v_hp like '62%' then v_hp := '0' || substr(v_hp, 3);
  elsif v_hp like '8%'  then v_hp := '0' || v_hp;
  end if;

  if v_hp !~ '^0\d{9,13}$' then
    raise exception 'Nomor HP tidak valid: %', p_no_hp;
  end if;

  -- ---------------------------------------------------------------
  -- 1. contacts — anonimkan field pribadi, PERTAHANKAN field yang
  --    dipakai laporan agregat (jenis_kendaraan, tahun, kota,
  --    status_call, status_prospek, source, tags, timestamps).
  --    no_hp tidak boleh NULL (kolom not null) dan tunduk unique index
  --    parsial (idx_contacts_no_hp_unique) — diganti string unik per
  --    baris, bukan dikosongkan, supaya tidak bentrok dan tidak lagi
  --    jadi nomor telepon yang bisa dipakai menghubungi siapa pun.
  -- ---------------------------------------------------------------
  with updated as (
    update public.contacts
    set nama         = '[Dihapus atas permintaan pemilik data]',
        no_hp        = 'DIHAPUS-' || id::text,
        no_hp_alt    = null,
        nomor_polisi = null,
        domisili     = null,
        kelurahan    = null,
        notes        = null
    where no_hp = v_hp
    returning id
  )
  select count(*) into v_contacts_count from updated;

  -- ---------------------------------------------------------------
  -- 2. web_lead_submissions — sama: anonimkan field pribadi, biarkan
  --    field atribusi/kendaraan yang dipakai statistik agregat.
  -- ---------------------------------------------------------------
  -- no_hp_raw kolom not null (beda dari no_hp_alt/notes di contacts di
  -- atas, yang nullable) — diisi konstanta, bukan null. Ketahuan lewat
  -- pengujian sungguhan terhadap Supabase (23502 not-null violation),
  -- bukan dari membaca skema saja.
  with updated as (
    update public.web_lead_submissions
    set nama       = '[Dihapus atas permintaan pemilik data]',
        no_hp      = 'DIHAPUS-' || id::text,
        no_hp_raw  = 'DIHAPUS',
        catatan    = null,
        ip_hash    = null
    where no_hp = v_hp
    returning id
  )
  select count(*) into v_submissions_count from updated;

  -- ---------------------------------------------------------------
  -- 3. do_not_contact — TAMBAHKAN, JANGAN PERNAH hapus dari sini.
  --    alasan 'Diminta Nasabah' — satu-satunya nilai yang cocok dari
  --    check constraint yang ada (lihat 0003).
  -- ---------------------------------------------------------------
  if not exists (select 1 from public.do_not_contact d where d.no_hp = v_hp) then
    insert into public.do_not_contact (no_hp, alasan)
    values (v_hp, 'Diminta Nasabah');
    v_added_to_dnc := true;
  end if;

  return query select v_contacts_count, v_submissions_count, v_added_to_dnc;
end;
$$;

comment on function public.hapus_data_pribadi(text) is
  'Hak hapus data UU PDP. Dipanggil manual oleh admin lewat prosedur di '
  'docs/PERMINTAAN_HAPUS_DATA.md (repo mitrabertuah-web) — BUKAN endpoint '
  'publik. Anonimkan, tidak hard-delete (lihat komentar migrasi). Tidak '
  'pernah menghapus baris do_not_contact.';

revoke all on function public.hapus_data_pribadi(text) from public, anon;
