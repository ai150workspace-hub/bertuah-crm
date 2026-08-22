// lib/call-outcome/catalog.ts
//
// DAFTAR HASIL PANGGILAN — DATAR, MENGGANTIKAN POHON 4 TINGKAT
//
// Kenapa diratakan:
//   - 80 panggilan/hari × 4 dropdown = 320 interaksi form/hari ≈ 43 menit
//     murni mengisi form, 9% hari kerja mitra.
//   - 'Interest' dan 'Prospect' sama-sama berujung Hot Lead di PRD lama,
//     jadi pembedanya tidak punya konsekuensi apa pun.
//   - Cabang CONNECTED memuat Busy Tone dan Mailbox, sehingga contact rate
//     menghitung nada sibuk sebagai "tersambung" — KPI utama mengukur hal
//     yang salah dan selalu terlihat lebih bagus dari kenyataan.
//
// Sekarang: 1 dropdown. Sub-alasan HANYA muncul untuk TIDAK_MEMENUHI_SYARAT,
// karena justru di situlah data paling berharga yang kamu punya.

export const HASIL_PANGGILAN = [
  // ---- Bicara dengan orang yang tepat (RPC = true) --------------------
  {
    kode: 'MINAT',
    label: 'Tertarik — kirim simulasi',
    grup: 'Bicara dengan orangnya',
    rpc: true,
    statusKontak: 'Hot Lead',
    wajib: ['simulasi'],
    aksi: 'Kirim simulasi WA sekarang, jangan ditunda.',
  },
  {
    kode: 'JANJI_TEMU',
    label: 'Janji ketemu / survey',
    grup: 'Bicara dengan orangnya',
    rpc: true,
    statusKontak: 'Hot Lead',
    wajib: ['tanggal_followup'],
    aksi: 'Masuk antrean pada hari H.',
  },
  {
    kode: 'PIKIR_PIKIR',
    label: 'Masih pikir-pikir',
    grup: 'Bicara dengan orangnya',
    rpc: true,
    statusKontak: 'Warm',
    wajib: [],
    aksi: 'Pengingat otomatis H+3.',
  },
  {
    kode: 'KONFIRMASI_PASANGAN',
    label: 'Perlu konfirmasi pasangan / keluarga',
    grup: 'Bicara dengan orangnya',
    rpc: true,
    statusKontak: 'Warm',
    wajib: ['tanggal_followup'],
    aksi: 'Masuk antrean pada tanggal yang dijanjikan.',
  },
  {
    kode: 'TOLAK_HARGA',
    label: 'Tolak — bunga / angsuran kemahalan',
    grup: 'Bicara dengan orangnya',
    rpc: true,
    statusKontak: 'Closed',
    wajib: [],
    aksi: 'Kalau sering muncul, paket rate-mu tidak kompetitif.',
  },
  {
    kode: 'TOLAK_BUTUH',
    label: 'Tolak — tidak butuh dana',
    grup: 'Bicara dengan orangnya',
    rpc: true,
    statusKontak: 'Closed',
    wajib: [],
    aksi: 'Boleh dihubungi lagi 6 bulan lagi.',
  },
  {
    kode: 'TIDAK_MEMENUHI_SYARAT',
    label: 'Tidak lolos syarat',
    grup: 'Bicara dengan orangnya',
    rpc: true,
    statusKontak: 'Closed',
    wajib: ['sub_alasan'],
    aksi: 'INI angka paling berharga di sistem — ia mengukur mutu databasemu.',
  },

  // ---- Tersambung tapi bukan orangnya (RPC = false) -------------------
  {
    kode: 'MINTA_TELEPON_LAIN',
    label: 'Minta dihubungi lain waktu',
    grup: 'Tersambung, belum bisa bicara',
    rpc: false,
    statusKontak: 'In Progress',
    wajib: ['tanggal_followup'],
    aksi: 'Masuk antrean pada hari H.',
  },
  {
    kode: 'BUKAN_ORANGNYA',
    label: 'Orangnya tidak ada / nomor keluarga',
    grup: 'Tersambung, belum bisa bicara',
    rpc: false,
    statusKontak: 'In Progress',
    wajib: [],
    aksi: 'Coba lagi di jam berbeda.',
  },

  // ---- Tidak tersambung (RPC = false) --------------------------------
  {
    kode: 'TIDAK_DIANGKAT',
    label: 'Tidak diangkat / sibuk / mailbox',
    grup: 'Tidak tersambung',
    rpc: false,
    statusKontak: 'In Progress',
    wajib: [],
    aksi: 'Coba lagi maksimal 3 kali, lalu istirahatkan.',
  },
  {
    kode: 'NOMOR_SALAH',
    label: 'Nomor salah / tidak aktif',
    grup: 'Tidak tersambung',
    rpc: false,
    statusKontak: 'Invalid',
    wajib: [],
    aksi: 'Tidak bisa di-assign ulang.',
  },
  {
    kode: 'JANGAN_HUBUNGI',
    label: 'Minta jangan dihubungi lagi / meninggal',
    grup: 'Tidak tersambung',
    rpc: false,
    statusKontak: 'Invalid',
    wajib: [],
    aksi: 'MASUK do_not_contact. Kewajiban POJK 6/2022 — hentikan penawaran '
        + 'begitu persetujuan ditarik. Tidak bisa dibatalkan mitra.',
  },
] as const;

export type KodeHasil = (typeof HASIL_PANGGILAN)[number]['kode'];

/**
 * Sub-alasan hanya untuk TIDAK_MEMENUHI_SYARAT.
 *
 * Ini SATU-SATUNYA lapis kedua yang tersisa, dan ia layak dipertahankan:
 * inilah yang mengukur berapa persen databasemu benar-benar layak.
 * Khususnya BPKB_MASIH_KREDIT — kendaraan kredit wajib diasuransikan
 * all-risk oleh leasing, jadi database asuransi secara struktural penuh
 * unit yang BPKB-nya sedang dipegang. Kalau angka ini di atas 40%,
 * sumber datamu salah untuk produk ini, dan kamu perlu tahu itu di
 * minggu pertama, bukan bulan keenam.
 */
export const SUB_ALASAN_TIDAK_LAYAK = [
  { kode: 'BPKB_MASIH_KREDIT',   label: 'Kendaraan masih kredit / BPKB di leasing' },
  { kode: 'BPKB_BUKAN_ATAS_NAMA',label: 'BPKB bukan atas nama sendiri' },
  { kode: 'PAJAK_MATI',          label: 'Pajak mati / STNK bermasalah' },
  { kode: 'UNIT_TERLALU_TUA',    label: 'Tahun kendaraan tidak diterima leasing' },
  { kode: 'LUAR_COVERAGE',       label: 'Domisili di luar area layanan' },
  { kode: 'RIWAYAT_KREDIT',      label: 'Bermasalah di SLIK / blacklist' },
  { kode: 'LAINNYA',             label: 'Lainnya' },
] as const;

export type KodeSubAlasan = (typeof SUB_ALASAN_TIDAK_LAYAK)[number]['kode'];

export type StatusKontak = 'Hot Lead' | 'Warm' | 'In Progress' | 'Closed' | 'Invalid';

export const GRUP_URUT = [
  'Bicara dengan orangnya',
  'Tersambung, belum bisa bicara',
  'Tidak tersambung',
] as const;
