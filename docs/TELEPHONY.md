# Brief untuk Claude Code — Lapisan Telepon FinMatch PKU

Tempel berkas ini ke root proyek sebagai `docs/TELEPHONY.md`, lalu jalankan
urutan prompt di Bagian 5. Jangan lompat ke prompt terakhir.

---

## 1. Keputusan arsitektur (jangan diubah tanpa alasan kuat)

**Bangun untuk Cloud PBX, jalankan dengan unggah manual.**

Kontrak di `lib/telephony/types.ts` diturunkan dari kemampuan **Cloud PBX** —
provider paling menuntut. Adapter manual memenuhinya semampunya.

Kenapa arahnya begitu, bukan sebaliknya: kalau kontrak dibentuk dari alur
"unggah harian", bentuknya jadi **tarik/batch** ("kasih saya rekaman hari ini").
PBX itu **dorong/webhook**, real-time, dengan call ID otoritatif. Interface
batch tidak akan muat, dan kamu tetap rewrite — persis yang mau dihindari.

### Pemisahan yang menentukan segalanya

```
call_logs      = apa yang MITRA KATAKAN terjadi   (input manusia)
call_sessions  = apa yang SISTEM TELEPON CATAT    (bukti mesin)
```

Deteksi panggilan fiktif lahir dari **selisih keduanya**. Kalau digabung jadi
satu tabel, tidak ada yang bisa dibandingkan dan seluruh gunanya hilang.
**Jangan pernah menggabung dua tabel ini**, seberapa pun terlihat mubazir.

### Kenapa rekaman saja tidak cukup

Alasan lapisan telepon ini ada adalah anti-fraud + supervisi dari Jakarta.
Tapi pada opsi manual, **mitra yang menentukan apa yang diunggah** — yang
mengarang panggilan tinggal tidak mengunggah rekamannya.

Yang mendeteksi adalah **call log perangkat**, bukan rekaman. Unggahan harian
karena itu ada **dua** berkas:

| Berkas | Gunanya |
|---|---|
| `calllog.csv` | Bukti panggilan terjadi → rekonsiliasi anti-fraud |
| folder rekaman | Materi coaching + tinjauan kualitas |

Baris `call_logs` tanpa pasangan di `calllog.csv` = **panggilan fiktif**.

---

## 2. Berkas yang disertakan

```
supabase/migrations/
  0002_telephony.sql        call_sessions, call_recordings, device_log_imports,
                            reconciliation_daily, view v_papan_harian, RLS
  0003_call_outcome_datar.sql  Ratakan pohon 4 tingkat -> 12 opsi datar,
                            do_not_contact, trigger DNC, v_rpc_harian,
                            v_mutu_database
lib/call-outcome/
  catalog.ts            12 opsi datar + sub-alasan. Sumber kebenaran tunggal.
  derive.ts             Status kontak, validasi, efek samping, peta pohon lama
lib/telephony/
  types.ts              Kontrak. Diturunkan dari PBX. JANGAN dilemahkan.
  phone.ts              Normalisasi nomor Indonesia -> '628...' (digit saja)
  match.ts              Parsing nama berkas rekaman + pencocokan fuzzy
  reconcile.ts          Adu call_logs CRM vs call log perangkat
  provider.ts           Factory: pilih adapter dari system_config/env
  deps.ts               TEMPAT KERJAMU — rakit Supabase ke dalam kontrak
  adapters/
    manual.ts           Opsi 1 — AKTIF SEKARANG (termasuk parser CSV)
    pbx.ts              Opsi 3 — SIAP, BELUM AKTIF
t/test.ts               37 uji lapisan telepon
t/test-outcome.ts       47 uji call outcome + pemetaan pohon lama
```

Seluruh berkas lolos `tsc --strict --noUncheckedIndexedAccess` dan **84 uji**.
Jalankan ulang setiap kali menyentuh `match`, `reconcile`, atau `derive`.

---

## 3. Aturan yang tidak boleh dilanggar

1. **`call_logs.call_duration` tidak boleh dipakai untuk KPI atau deteksi fraud.**
   Pada opsi manual, angka itu diketik mitra sendiri. Pakai
   `call_sessions.talk_time_detik`. Kolom lama sudah diberi `comment` peringatan.

2. **Mitra tidak boleh punya akses baca maupun tulis ke `call_sessions`,
   `call_recordings`, dan `reconciliation_daily`.** Bukti tentang seseorang
   tidak boleh bisa diedit oleh orang itu. RLS di migrasi sudah begitu —
   jangan ditambahi policy untuk mitra.

3. **Nomor di luar tabel `contacts` dibuang saat impor, tidak pernah disimpan.**
   Call log pribadi mitra bukan urusan sistem ini. Ini minimisasi data sesuai
   UU PDP sekaligus penjaga kepercayaan mitra. `parseDeviceCallLog()` sudah
   menerapkannya lewat parameter `nomorDikenal`.

4. **Jendela rekonsiliasi sengaja asimetris** (45 menit sebelum, 3 menit
   sesudah). Mitra menelepon dulu, mengisi form belakangan. Jendela simetris
   menghasilkan tuduhan palsu — dan tuduhan palsu ke mitra jauh lebih merusak
   daripada satu panggilan fiktif yang lolos.

5. **Pencocokan rekaman itu fuzzy — jangan dipaksa jadi foreign key polos.**
   Simpan `match_confidence`. Status `conflict` (dua sesi sama-sama masuk
   toleransi) **tidak boleh ditebak** — masukkan ke antrean tinjau.

6. **Semua nomor disimpan sebagai `628...`, digit saja, tanpa `+`.**
   Selalu lewat `normalisasiNomor()`. Satu format tidak konsisten dan seluruh
   deteksi fraud menghasilkan angka palsu.

7. **UI membaca `capabilities`, bukan menebak provider.** Tombol "Panggil dari
   CRM" hanya muncul saat `clickToCall`. Kolom durasi hanya bisa diketik saat
   `authoritativeDuration === false`.

---

## 4. Pemicu pindah ke PBX — sepakati sekarang

> Pindah saat **mitra ke-3 masuk**, ATAU **selisih rekonsiliasi pertama muncul**,
> ATAU **bulan ke-3** — mana yang lebih dulu.

Biaya bukan penghalangnya: 5 kursi × Rp150–300rb = Rp750rb–1,5jt/bulan, lawan
pendapatan Rp47jt saat matang — 2–3%. Kamu mulai dari yang murah demi
**kecepatan mulai**, bukan demi hemat. Tanpa pemicu tertulis, "sementara"
jadi permanen.

Saat pindah, yang berubah hanya:
1. Isi kredensial di `.env`
2. `update system_config set value='pbx' where key='telephony_provider'`
3. Daftarkan URL webhook di dashboard provider
4. Isi `buatPbxDeps()` di `deps.ts`

Tidak ada kode pemanggil yang disentuh. Itu seluruh gunanya kerja ini.

---

## 5. Urutan prompt untuk Claude Code

Kerjakan **satu per satu**. Jalankan `npx tsc --noEmit` setelah tiap langkah.

Urutan migrasi mengikat: **0002 sebelum 0003**. Trigger di 0003 memakai
`do_not_contact` dan `public.is_admin()` yang lahir di langkah sebelumnya.

### Prompt 1 — orientasi (jangan minta dia menulis kode dulu)

```
Baca docs/TELEPHONY.md lalu petakan proyek ini untukku. Aku ingin tahu:

1. Di mana call_logs ditulis saat ini — server action, route handler, atau
   langsung dari komponen klien?
2. Bagaimana tombol telepon di CallDrawer bekerja sekarang?
3. Apakah sudah ada helper normalisasi nomor? Kalau ada, di berkas mana, dan
   apakah formatnya sama dengan lib/telephony/phone.ts (628..., digit saja)?
4. Apakah Supabase Storage sudah dipakai? Bucket apa saja yang ada?
5. Apakah ada job terjadwal / cron yang sudah berjalan?

Jangan ubah apa pun. Balas dengan daftar path berkas dan temuannya.
```

### Prompt 2 — pasang fondasi

```
Terapkan supabase/migrations/0002_telephony.sql, lalu salin berkas
lib/telephony/** ke proyek.

Migrasi memakai helper public.is_admin(). Cek apakah sudah ada. Kalau belum,
buat lebih dulu sebagai security definer — policy RLS yang menyeleksi
public.users dari dalam policy di tabel yang sama menyebabkan infinite
recursion:

  create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as
  $$ select exists (select 1 from public.users
                    where id = auth.uid() and role = 'admin') $$;

Setelah itu jalankan npx tsc --noEmit dan laporkan error yang tersisa.
Jangan sentuh deps.ts dulu.
```

### Prompt 3 — rakit dependensi (bagian tersulit)

```
Isi lib/telephony/deps.ts, fungsi buatManualDeps() saja. Biarkan
buatPbxDeps() tetap melempar error.

Kontraknya ada di interface ManualDeps pada adapters/manual.ts. Catatan
implementasi:

- ambilNomorDikenal(): SELECT no_hp FROM contacts, lewatkan tiap nomor ke
  normalisasiNomor(), kembalikan Set. Cache per-request — ini dipanggil
  sekali per unggahan, bukan per baris.
- simpanSesi(): upsert ke call_sessions dengan source='manual',
  verified=true, verified_by='device_log'. Kunci dedup: (agent_id,
  phone_e164, started_at) supaya unggah ulang di hari yang sama tidak
  menggandakan baris.
- ambilSesiHari(): sesi milik mitra pada tanggal itu, kembalikan
  {id, phoneE164, startedAt}.
- signedUrl(): Supabase Storage createSignedUrl, masa berlaku 1 jam.

Pakai service-role client, bukan client sesi pengguna — mitra tidak punya
akses ke tabel ini secara sengaja.

Jalankan npx tsc --noEmit setelah selesai.
```

### Prompt 4 — endpoint unggah harian

```
Buat app/api/telephony/upload/route.ts.

POST multipart: calllog (CSV, WAJIB), recordings[] (audio, opsional),
tanggal (YYYY-MM-DD).

Alur:
1. Autentikasi. Mitra hanya boleh mengunggah untuk dirinya sendiri; admin
   boleh untuk siapa saja lewat field agentId.
2. TOLAK kalau calllog tidak ada. Rekaman tanpa call log tidak punya nilai
   anti-fraud — kembalikan 422 dengan pesan yang menjelaskan itu, jangan
   sekadar "field wajib".
3. Unggah rekaman ke bucket 'call-recordings', path:
   {agentId}/{tanggal}/{namaBerkasAsli}
4. Panggil getTelephonyProvider().ingest({...})
5. Kembalikan IngestResult apa adanya.

Batas: 200 berkas, 25MB per berkas per unggahan.
Jangan tulis logika parsing di route ini — semua sudah ada di adapter.
```

### Prompt 5 — job rekonsiliasi

```
Buat app/api/cron/reconcile/route.ts, jalan tiap hari 22:00 WIB.

Untuk tiap mitra aktif, untuk tanggal kemarin:
1. Lewati kalau provider.buktiCukupTanpaRekonsiliasi() true (mode PBX)
2. Ambil call_logs mitra hari itu -> bentuk CrmCallLog[]
   (phoneE164 dari contacts.no_hp lewat normalisasiNomor,
    dicatatPada = call_logs.timestamp)
3. Ambil call_sessions source='manual' hari itu -> bentuk DeviceCall[]
4. Panggil rekonsiliasiHarian() dari lib/telephony/reconcile
5. Upsert hasilnya ke reconciliation_daily
6. Kalau status 'Bermasalah', panggil polaMencurigakan() atas 7 hari
   terakhir. Kirim notifikasi HANYA kalau polanya berulang — jangan
   berisik karena satu hari jelek. HP mati atau ekspor gagal itu wajar.

Amankan dengan CRON_SECRET di header.
```

### Prompt 6 — panel supervisi (ini yang kamu buka dari Jakarta)

```
Buat app/(dashboard)/admin/supervisi/page.tsx. Rancang untuk layar HP
lebih dulu — ini dibuka dari Jakarta tiap pagi, bukan dari desktop.

Bagian:
1. Papan harian dari view v_papan_harian: per mitra tampilkan dial,
   menit bicara, RPC, hot lead, skor integritas. Beri warna pada status.
2. Antrean tinjau: call_recordings dengan match_confidence in
   ('low','unmatched','conflict'). Pemutar audio + pilihan sesi + tombol
   konfirmasi. Isi match_reviewed_by/at saat dikonfirmasi.
3. Riwayat integritas: reconciliation_daily 14 hari terakhir per mitra.
   Klik baris -> daftar id call_logs yang diduga fiktif, lengkap dengan
   nama kontak dan status yang dicatat mitra.

Jangan tampilkan tuduhan sebagai kepastian. Label yang dipakai
"Perlu Ditinjau", bukan "Fraud" — sistem ini menunjukkan selisih, bukan
memutuskan niat.
```

### Prompt 7 — sesuaikan CallDrawer

```
Ubah CallDrawer supaya memakai capabilities:

const caps = await getCapabilities();

- caps.clickToCall false -> tombol tetap membuka tel: seperti sekarang
- caps.authoritativeDuration true -> BUANG field input durasi dari form.
  Ini penting: durasi yang diketik mitra tidak boleh masuk KPI, dan
  membiarkan fieldnya ada memberi kesan palsu bahwa angka itu berarti.
- Tambahkan penanda kecil "rekaman menyusul dari unggahan harian" saat
  caps.autoRecording false, supaya mitra tahu unggahannya masih diperlukan.

Jangan tambahkan pengecekan provider di komponen mana pun. Hanya
capabilities.
```

---

## 5b. Call status tree — diratakan (migrasi 0003)

### Apa yang berubah

| | Pohon lama | Daftar datar baru |
|---|---|---|
| Interaksi form | 4 dropdown selalu | rata-rata **1,42** |
| Pada 80 panggilan/hari | 320 interaksi | **113 interaksi** |
| Waktu terbuang | ~43 menit/hari | ~15 menit/hari |
| Contact rate | menghitung nada sibuk sebagai "tersambung" | hanya yang benar-benar bicara |

12 opsi datar, satu dropdown. Sub-alasan **hanya** muncul untuk
`TIDAK_MEMENUHI_SYARAT` — dan itu sengaja dipertahankan, karena kolom itulah
yang mengukur mutu databasemu. `pct_bpkb_kredit` di atas 40% berarti sumber
datamu salah untuk produk BPKB, dan kamu perlu tahu itu di minggu pertama.

`Interest` dan `Prospect` digabung jadi `MINAT` — di PRD lama keduanya
sama-sama berujung Hot Lead, jadi pembedanya memang tidak pernah berkonsekuensi.

**Tidak ada satu pun dari 13 alasan Unprospect lama yang hilang.** Semuanya
dipetakan di `dariPohonLama()` dan diuji (47 uji, semua lulus).

Migrasi **tidak membuang** kolom `level_1..level_4`. Dipetakan, dilonggarkan,
dibiarkan sebagai cadangan. Ada blok `0004` dikomentari di bagian bawah berkas
untuk membuangnya nanti — jalankan setelah minimal 2 minggu.

### Prompt 8 — terapkan migrasi call tree

```
Terapkan supabase/migrations/0003_call_outcome_datar.sql dan salin
lib/call-outcome/** ke proyek.

Migrasi ini WAJIB dijalankan SETELAH 0002 — triggernya memakai
do_not_contact dan public.is_admin().

Setelah migrasi, verifikasi backfill sebelum lanjut:

  select hasil, sub_alasan, count(*)
  from call_logs group by 1,2 order by 3 desc;

  select count(*) from call_logs where hasil is null;   -- harus 0

Laporkan hasil kedua query itu. Jangan sentuh UI dulu.
```

### Prompt 9 — ganti form 4 tingkat di CallDrawer

```
Ganti cascading dropdown 4 tingkat di CallDrawer dengan satu Select dari
HASIL_PANGGILAN (lib/call-outcome/catalog.ts).

- Kelompokkan opsi memakai GRUP_URUT lewat SelectGroup/SelectLabel Shadcn.
  Datanya tetap datar — pengelompokan hanya visual.
- Tampilkan field kondisional dari `wajib` pada opsi terpilih:
    'sub_alasan'        -> Select dari SUB_ALASAN_TIDAK_LAYAK
    'tanggal_followup'  -> date picker
    'simulasi'          -> nominal + tenor
  Jangan hardcode pengecekan kode di komponen — baca dari katalog.
- Validasi pakai validasiHasil() sebelum submit. Tampilkan pesan errornya
  apa adanya; sudah ditulis untuk mitra, bukan untuk developer.
- Tampilkan `aksi` dari opsi terpilih sebagai teks bantu kecil.

Buang useReducer state pohon lama dan seluruh berkas types/call-status.ts.
```

### Prompt 10 — sambungkan efek samping + tutup lubang DNC

```
Di server action penyimpan call log:

1. Panggil validasiHasil() lagi di server. Jangan percaya validasi klien.
2. Panggil efekSamping() dan terapkan:
   - update contacts.status_call dari statusKontak
   - kalau jadwalkanPada ada, simpan sebagai tanggal follow-up supaya
     kontaknya muncul di antrean pada hari H
   - masukDnc sudah ditangani trigger DB, jangan digandakan di aplikasi
3. Isi call_logs.hasil dan sub_alasan. JANGAN isi level_1..level_4 lagi.

Lalu perbaiki assign_contacts_to_agent() — ini lubang yang masih terbuka.
Tambahkan di subquery pemilihan kontak:

  and not exists (
    select 1 from public.do_not_contact d
    where d.no_hp = contacts.no_hp
  )
  and coalesce(contacts.consent_status, 'Belum Ada') <> 'Ditarik'

Tanpa ini, JANGAN_HUBUNGI cuma jadi catatan tanpa akibat dan kontaknya
akan ditelepon lagi oleh mitra berikutnya.

Terakhir, ganti semua pemakaian v_agent_monthly_performance dengan
v_rpc_harian. View lama punya perkalian baris dari join ganda dan
definisi contact rate yang keliru.
```

---

## 6. Yang harus disiapkan di sisi mitra (bukan pekerjaan coding)

| Hal | Rekomendasi |
|---|---|
| Aplikasi perekam | Cube ACR atau Boldbeast — pastikan nama berkas memuat nomor + waktu |
| Aplikasi ekspor call log | Apa pun yang bisa ekspor CSV harian (nomor, tipe, tanggal, durasi) |
| Kewajiban harian | Unggah **dua-duanya** sebelum pukul 21:00 WIB |
| Persetujuan mitra | Perjanjian kemitraan harus menyebut perekaman panggilan kerja secara eksplisit |
| Pemberitahuan konsumen | Skrip pembuka wajib menyebut panggilan direkam — POJK 6/2022 |

**Uji format dulu sebelum merekrut.** Minta satu mitra percobaan mengunggah
sehari penuh, lalu periksa `device_log_imports.baris_dibuang`. Kalau angkanya
tinggi, format ekspornya tidak cocok dan `ALIAS` di `adapters/manual.ts`
perlu ditambah — jauh lebih murah ketahuan sekarang daripada setelah 5 mitra
jalan sebulan.

---

## 7. Perkiraan penyimpanan

5 mitra × ~25 rekaman/hari × ~2 menit × ~240KB/menit ≈ **1,3 GB/bulan**.

Supabase free tier 1 GB — kamu akan tembus di bulan pertama. Pro (~Rp400rb/bulan)
memberi 100 GB. Pasang retensi **90 hari** (`telephony_retensi_hari` sudah ada
di `system_config`) dan buat job penghapusan, kalau tidak biaya storage naik
terus selamanya untuk rekaman yang tidak pernah didengar lagi.
