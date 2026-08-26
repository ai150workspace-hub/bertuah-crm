-- =====================================================================
-- 0015_script_wa_reengagement.sql — Script Sidebar (knowledge panel),
-- WA Template System, dan Re-engagement Leads (cold lead 30 hari).
-- =====================================================================
-- KOREKSI dari draft awal: kolom hasil panggilan flat di call_logs
-- bernama `hasil` (bukan `hasil_panggilan`), dan nilainya kode seperti
-- 'TOLAK_HARGA'/'TIDAK_MEMENUHI_SYARAT' (bukan label "Tidak lolos
-- syarat") - lihat lib/call-outcome/catalog.ts. View v_reengagement_leads
-- di bagian 3 sudah disesuaikan. Hanya 3 kode yang statusKontak-nya
-- 'Closed': TOLAK_HARGA, TOLAK_BUTUH, TIDAK_MEMENUHI_SYARAT - jadi
-- exclude TIDAK_MEMENUHI_SYARAT otomatis menyisakan TOLAK_HARGA &
-- TOLAK_BUTUH sebagai target re-engagement.

-- ---------------------------------------------------------------------
-- 1. script_content — 5 section sidebar panduan call
-- ---------------------------------------------------------------------
create table public.script_content (
  id                uuid primary key default uuid_generate_v4(),
  section           text not null check (section in (
                      'opening', 'probing', 'presentasi', 'closing',
                      'objection_handling'
                    )),
  scenario_name     text not null,
  category          text,
  script_text       text not null,
  tips_text         text,
  escalation_rule   text,
  is_buying_signal  boolean not null default false,
  display_order     int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger script_content_updated_at
  before update on public.script_content
  for each row execute function public.handle_updated_at();

alter table public.script_content enable row level security;

create policy "All authenticated users can view script content"
  on public.script_content for select
  using (auth.role() = 'authenticated');

create policy "Admin can manage script content"
  on public.script_content for all
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- ---------------------------------------------------------------------
-- 2. wa_templates — 4 jenis template WA
-- ---------------------------------------------------------------------
create table public.wa_templates (
  id             uuid primary key default uuid_generate_v4(),
  template_key   text not null unique check (template_key in (
                   'initial_followup', 'appointment_confirmation',
                   'followup_reminder', 'reengagement'
                 )),
  template_name  text not null,
  template_text  text not null,
  when_to_use    text,
  display_order  int not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger wa_templates_updated_at
  before update on public.wa_templates
  for each row execute function public.handle_updated_at();

alter table public.wa_templates enable row level security;

create policy "All authenticated users can view wa templates"
  on public.wa_templates for select
  using (auth.role() = 'authenticated');

create policy "Admin can manage wa templates"
  on public.wa_templates for all
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- ---------------------------------------------------------------------
-- 3. Re-engagement: kolom tracking + view kandidat
-- ---------------------------------------------------------------------
alter table public.contacts
  add column if not exists last_reengagement_sent_at timestamptz;

-- security_invoker: view menghormati RLS milik user yang query, bukan
-- pemilik view - defense in depth, di luar filter assigned_to yang
-- sudah dipasang aplikasi di setiap query ke view ini.
create or replace view public.v_reengagement_leads
  with (security_invoker = true) as
select
  c.id, c.nama, c.no_hp, c.jenis_kendaraan, c.merk_tipe, c.tahun,
  c.assigned_to,
  cl.hasil as last_outcome,
  cl.timestamp as last_contacted_at
from public.contacts c
join lateral (
  select hasil, timestamp
  from public.call_logs
  where contact_id = c.id
  order by timestamp desc
  limit 1
) cl on true
where c.status_call = 'Closed'
  and cl.hasil != 'TIDAK_MEMENUHI_SYARAT'
  and cl.timestamp <= now() - interval '30 days'
  and (
    c.last_reengagement_sent_at is null
    or c.last_reengagement_sent_at <= now() - interval '30 days'
  );

-- ---------------------------------------------------------------------
-- 4. Seed data — script_content
-- ---------------------------------------------------------------------

-- OPENING
insert into public.script_content (section, scenario_name, script_text, tips_text, display_order) values
('opening', 'Standard Opening',
'Selamat [waktu], dengan Bapak/Ibu {{nama}}?

Perkenalkan saya [nama agen] dari Mitra Bertuah. Mohon waktunya sebentar ya Pak/Bu, saya ingin informasikan program spesial refinancing kendaraan yang mungkin bermanfaat untuk Bapak/Ibu.

Bapak/Ibu masih menggunakan {{kendaraan}} tahun {{tahun}} ya?',
'Tone: hangat, percaya diri, BUKAN jualan. Jeda setelah sebut nama — biarkan customer confirm. Sebut kendaraan untuk tunjukkan kita punya datanya.',
1),
('opening', 'Jika Customer Bilang "Siapa Ini?"',
'Baik Pak/Bu, saya [nama agen] dari Mitra Bertuah, perusahaan pembiayaan kendaraan. Kami mendapat data Bapak/Ibu sebagai pemilik {{kendaraan}}. Tujuan saya menghubungi untuk informasikan program pencairan dana tunai dengan jaminan BPKB kendaraan Bapak/Ibu.',
'Tetap tenang, jangan defensif. Langsung jelaskan value proposition.',
2);

-- PROBING
insert into public.script_content (section, scenario_name, category, script_text, tips_text, display_order) values
('probing', 'Kebutuhan Dana', 'Identifikasi Need',
'Kalau boleh tahu, apakah saat ini Bapak/Ibu ada rencana yang membutuhkan dana tambahan? Misalnya untuk renovasi, modal usaha, atau keperluan lainnya?',
'Identifikasi NEED — kalau ada need, closing rate naik 3x.', 1),
('probing', 'Kondisi Kendaraan', 'Validasi Asset',
'{{kendaraan}}-nya masih dipakai sehari-hari ya Pak/Bu? Kondisinya masih bagus?',
'Kendaraan aktif = eligible.', 2),
('probing', 'Pengalaman Pembiayaan', 'Ukur Familiarity',
'Sebelumnya Bapak/Ibu pernah mengajukan pembiayaan atau refinancing kendaraan?',
'Ukur familiarity & potential objection.', 3),
('probing', 'Budget Cicilan', 'Anchor Pricing',
'Kira-kira untuk cicilan bulanan, Bapak/Ibu nyamannya di kisaran berapa ya?',
'Anchor pricing supaya simulasi lebih tepat sasaran.', 4);

-- PRESENTASI
insert into public.script_content (section, scenario_name, script_text, tips_text, display_order) values
('presentasi', 'Pitch Utama',
'Jadi begini Pak/Bu, dengan program kami, Bapak/Ibu bisa mendapatkan dana tunai dengan jaminan BPKB kendaraan. Prosesnya cepat, dan cicilan bisa disesuaikan dengan kemampuan Bapak/Ibu.

Mau saya hitungkan simulasinya sekarang, Pak/Bu?',
'Fokus ke BENEFIT bukan fitur. "Cepat cair" = emotional trigger. Selalu close dengan pertanyaan.',
1);

-- CLOSING
insert into public.script_content (section, scenario_name, script_text, tips_text, display_order) values
('closing', 'Soft Close (Interest)',
'Berdasarkan hitungan, Bapak/Ibu bisa dapat dana {{jumlah}} dengan cicilan {{cicilan}}/bulan selama {{tenor}} bulan. Bagaimana menurut Bapak/Ibu, apakah sesuai dengan kebutuhan?',
'Jangan tanya "mau atau tidak" — tanya "apakah sesuai".', 1),
('closing', 'Hard Close (Prospect)',
'Kalau Bapak/Ibu berkenan, saya bisa langsung jadwalkan tim kami untuk survey kendaraan di lokasi Bapak/Ibu. Kapan waktu yang paling nyaman, besok atau lusa?',
'Alternative close: kasih 2 pilihan, bukan yes/no.', 2),
('closing', 'Follow-up Close',
'Baik Pak/Bu, saya akan kirimkan detail simulasinya via WhatsApp ya. Nanti saya hubungi lagi untuk follow-up. Terima kasih waktunya!',
'Always set next action & timeline.', 3);

-- HANDLING PENOLAKAN
insert into public.script_content (section, scenario_name, category, script_text, escalation_rule, is_buying_signal, display_order) values
('objection_handling', 'Saya tidak butuh / tidak minat', 'Rejection - Soft',
'Baik Pak/Bu, saya mengerti. Kalau boleh tahu, apakah memang tidak ada rencana yang membutuhkan dana tambahan saat ini? Kadang banyak nasabah kami yang awalnya belum kepikiran, tapi setelah tahu berapa dana yang bisa didapat, jadi tertarik. Mau saya hitungkan sebentar saja?',
'Jika tetap menolak setelah 1x rebuttal, pilih "Tolak — tidak butuh dana". Jangan push lebih.', false, 1),

('objection_handling', 'Saya sudah punya di tempat lain', 'Competitor',
'Wah bagus Pak/Bu, berarti sudah familiar ya dengan program seperti ini. Kalau boleh tahu, rate-nya berapa ya? Sering kali kami bisa berikan rate yang lebih kompetitif atau tenor yang lebih fleksibel. Mau saya bandingkan?',
'Jika customer sebutkan rate, hitung & bandingkan manual. Kalau kalah, pilih status "Tolak — bunga/angsuran kemahalan" dan catat detail kompetitor di catatan tambahan.', false, 2),

('objection_handling', 'Nanti saja / belum butuh sekarang', 'Timing',
'Tentu Pak/Bu, tidak apa-apa. Kalau saya hitungkan dulu simulasinya sekarang, nanti sewaktu-waktu Bapak/Ibu butuh, datanya sudah siap. Tidak ada kewajiban apa-apa kok. Boleh?',
'Jika OK, hitung simulasi dan kirim WA. Jika tetap tolak, pilih "Masih pikir-pikir" dan pastikan tanggal follow-up terisi.', false, 3),

('objection_handling', 'Dari mana dapat nomor saya?', 'Trust / Privacy',
'Baik Pak/Bu, data Bapak/Ibu kami peroleh dari database partner kami. Kami adalah perusahaan pembiayaan resmi. Tujuan kami menghubungi semata-mata untuk menginformasikan program yang mungkin bermanfaat. Apakah Bapak/Ibu bersedia mendengarkan sebentar?',
'Jika customer marah/keberatan keras, JANGAN PUSH — langsung pilih "Minta jangan dihubungi lagi".', false, 4),

('objection_handling', 'Bunga/rate-nya berapa?', 'Buying Signal',
'Untuk rate-nya tergantung dari jenis kendaraan dan tenor yang dipilih Pak/Bu. Supaya saya bisa kasih angka yang pasti, boleh saya tahu kendaraannya {{merk}} tahun {{tahun}} ya? Dan Bapak/Ibu prefer cicilan yang ringan per bulan atau tenor yang pendek?',
'INI BUYING SIGNAL — jangan kasih rate generik. Langsung probing detail lalu hitung simulasi spesifik.', true, 5),

('objection_handling', 'Saya mau pikir-pikir dulu', 'Stalling',
'Tentu Pak/Bu, ini memang keputusan yang perlu dipikirkan. Supaya pertimbangannya lebih lengkap, saya kirimkan detail simulasinya via WhatsApp ya. Nanti saya hubungi lagi sebentar untuk follow-up. Jam berapa biasanya Bapak/Ibu available?',
'WAJIB set tanggal follow-up spesifik saat pilih "Masih pikir-pikir". Jangan biarkan open-ended. Kirim WA template simulasi.', false, 6),

('objection_handling', 'Kendaraan saya sudah tua / KM tinggi', 'Eligibility Concern',
'Tidak apa-apa Pak/Bu, banyak kendaraan tahun {{tahun}} yang masih bisa kami biayai. Yang penting BPKB masih atas nama Bapak/Ibu dan kondisi kendaraan layak jalan. Mau saya cek dulu apakah eligible?',
'Jika memang tidak eligible sesuai kebijakan leasing, sampaikan jujur — jangan PHP. Pilih status "Tidak lolos syarat".', false, 7),

('objection_handling', 'Berapa maksimal dana yang bisa cair?', 'Buying Signal',
'Untuk dana cairnya tergantung dari nilai kendaraan dan tenor yang dipilih Pak/Bu. Mau saya hitung spesifik untuk kendaraan {{merk}} {{tahun}} Bapak/Ibu?',
'BUYING SIGNAL — langsung masuk ke simulasi. Jangan kasih angka generik tanpa hitung.', true, 8),

('objection_handling', 'Prosesnya ribet / lama', 'Process Concern',
'Justru itu kelebihan program kami Pak/Bu, prosesnya simpel: survey kendaraan di lokasi Bapak/Ibu (tidak perlu ke kantor), dokumen cukup KTP + BPKB. Praktis kan?',
'Highlight CONVENIENCE sebagai differentiator. Kalau masih ragu, tawarkan jelaskan step-by-step.', false, 9);

-- ---------------------------------------------------------------------
-- 5. Seed data — wa_templates
-- ---------------------------------------------------------------------
insert into public.wa_templates (template_key, template_name, template_text, when_to_use, display_order) values
('initial_followup', 'Initial Follow-up (Setelah Call - Interest)',
'Halo Bapak/Ibu {{nama}} 🙏

Terima kasih sudah meluangkan waktu untuk berbicara dengan saya tadi.

Seperti yang sudah kita diskusikan, berikut simulasi refinancing untuk {{kendaraan}} tahun {{tahun}}:

📋 *Simulasi Pembiayaan*
💰 Dana Cair: Rp {{jumlah}}
📅 Tenor: {{tenor}} bulan
💵 Cicilan/bulan: Rp {{cicilan}}

Proses cepat, estimasi cair setelah survey.

Apakah ada yang ingin ditanyakan, Pak/Bu?

Salam,
[nama agen]
Mitra Bertuah',
'Kirim segera setelah call dimana customer menunjukkan interest dan minta simulasi.', 1),

('appointment_confirmation', 'Appointment Confirmation (Prospect → Survey)',
'Halo Bapak/Ibu {{nama}} 🙏

Terima kasih atas kesediaannya.

✅ *Jadwal Survey Kendaraan*
📅 Hari/Tanggal: {{hari_tanggal}}
🕐 Jam: {{jam}} WIB
📍 Lokasi: {{alamat}}
🚗 Kendaraan: {{kendaraan}}

Tim kami akan menghubungi Bapak/Ibu 30 menit sebelum tiba.

Mohon siapkan:
1. BPKB asli
2. KTP pemilik
3. Kendaraan di lokasi

Terima kasih! 🙏',
'Kirim setelah customer confirm jadwal survey.', 2),

('followup_reminder', 'Follow-up Reminder (No Response 24-48 jam)',
'Halo Bapak/Ibu {{nama}} 🙏

Saya [nama agen] dari Mitra Bertuah, kemarin kita sudah diskusi mengenai program refinancing kendaraan Bapak/Ibu.

Apakah sudah sempat melihat simulasi yang saya kirimkan?

Jika ada pertanyaan atau ingin penyesuaian tenor/jumlah, silakan langsung reply ya Pak/Bu.

Terima kasih! 😊',
'Kirim H+1 atau H+2 jika customer belum respond WA sebelumnya.', 3),

('reengagement', 'Re-engagement (Cold Lead 30 Hari)',
'Halo Bapak/Ibu {{nama}} 🙏

Saya [nama agen] dari Mitra Bertuah. Beberapa waktu lalu kita sempat diskusi mengenai program refinancing.

Saat ini kami punya program terbaru untuk kendaraan Bapak/Ibu.

Apakah Bapak/Ibu masih tertarik untuk mendapatkan simulasi terbaru?

Salam hangat 🙏',
'Kirim ke leads yang pernah interest tapi tidak convert, setelah 30 hari tidak ada aktivitas.', 4);
