// lib/telephony/match.ts
//
// Mencocokkan berkas rekaman ke sesi panggilan.
//
// Pada opsi manual pencocokan ini FUZZY dan pasti kadang meleset.
// Jangan pura-pura pasti dengan foreign key polos — simpan tingkat
// keyakinan dan sediakan antrean tinjau. Rekaman yang salah ditempel
// ke kontak lain jauh lebih berbahaya daripada rekaman yang belum cocok.

import { normalisasiNomor } from './phone';
import type { MatchConfidence } from './types';

export interface ParsedRecording {
  namaBerkas: string;
  phoneE164: string | null;
  startedAt: Date | null;
}

export interface KandidatSesi {
  id: string;
  phoneE164: string;
  startedAt: Date;
}

export interface HasilCocok {
  sessionId: string | null;
  confidence: MatchConfidence;
  deltaDetik: number | null;
  alasan: string;
}

// ---------------------------------------------------------------------
// Parsing nama berkas
// ---------------------------------------------------------------------
// Aplikasi perekam Android menamai berkas dengan gaya berbeda-beda:
//   Cube ACR   : +628123456789_20260821_143022.m4a
//   Boldbeast  : 20260821_143022_+628123456789.amr
//   MIUI       : 20260821143022_628123456789.mp3
//   Samsung    : Call_628123456789_260821_143022.m4a
//   Appliqato  : Call recording Budi_628123456789_20260821143022.m4a
//
// Alih-alih mengejar setiap format, ambil pendekatan tahan banting:
// cari deretan digit yang LOLOS normalisasi nomor, dan cari pola
// tanggal-waktu di mana pun ia berada.

// Penjaga (?<!\d) dan (?!\d) itu WAJIB, bukan hiasan.
// Tanpa penjaga, pola tanpa pemisah akan cocok di TENGAH nomor telepon —
// '628123456789_20260821_143022' cocok sebagai 2345-67-89 20:26:08,
// menghasilkan tanggal ngawur, dan waktu aslinya tidak pernah terbaca.
const POLA_WAKTU: Array<{ re: RegExp; urutan: string[] }> = [
  // 2026-08-21 14-30-22 | 2026-08-21_14.30.22 | 2026_08_21 14:30:22
  { re: /(?<!\d)(\d{4})[-_](\d{2})[-_](\d{2})[\sT_-]+(\d{2})[-_.:](\d{2})[-_.:](\d{2})(?!\d)/g, urutan: ['Y','M','D','h','m','s'] },
  // 20260821_143022 | 20260821143022
  { re: /(?<!\d)(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})(?!\d)/g,                        urutan: ['Y','M','D','h','m','s'] },
  // 260821_143022  (tahun 2 digit)
  { re: /(?<!\d)(\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})(?!\d)/g,                         urutan: ['y','M','D','h','m','s'] },
];

/** Zona waktu operasi. WIB = UTC+7, tanpa DST. */
const OFFSET_WIB_JAM = 7;

function bikinTanggalWib(Y: number, M: number, D: number, h: number, m: number, s: number): Date | null {
  // Validasi rentang DULU. Date.UTC diam-diam menggulung nilai di luar
  // rentang (bulan 67 jadi tahun berikutnya) — itu menghasilkan tanggal
  // yang tampak sah dari salah tafsir digit.
  if (Y < 2020 || Y > 2100) return null;
  if (M < 1 || M > 12) return null;
  if (D < 1 || D > 31) return null;
  if (h > 23 || m > 59 || s > 59) return null;

  const d = new Date(Date.UTC(Y, M - 1, D, h - OFFSET_WIB_JAM, m, s));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function parseNamaBerkas(namaBerkas: string): ParsedRecording {
  const dasar = namaBerkas.replace(/\.[a-z0-9]{2,4}$/i, '');

  // --- nomor telepon ---
  let phoneE164: string | null = null;
  for (const kandidat of dasar.match(/\+?\d{8,15}/g) ?? []) {
    const n = normalisasiNomor(kandidat);
    if (n) { phoneE164 = n; break; }
  }

  // --- tanggal & waktu ---
  // Telusuri SEMUA kemunculan tiap pola, bukan hanya yang pertama. Nama
  // kontak bisa mengandung angka, dan kecocokan palsu di awal string tidak
  // boleh membatalkan waktu yang sah di belakangnya.
  let startedAt: Date | null = null;
  cariWaktu:
  for (const { re, urutan } of POLA_WAKTU) {
    for (const m of dasar.matchAll(re)) {
      const v: Record<string, number> = {};
      urutan.forEach((k, i) => { v[k] = parseInt(m[i + 1]!, 10); });
      const tahun = v.Y ?? (2000 + (v.y ?? 0));
      const d = bikinTanggalWib(tahun, v.M!, v.D!, v.h!, v.m!, v.s!);
      if (d) { startedAt = d; break cariWaktu; }
    }
  }

  return { namaBerkas, phoneE164, startedAt };
}

// ---------------------------------------------------------------------
// Pencocokan
// ---------------------------------------------------------------------

/**
 * Cocokkan satu rekaman ke daftar sesi kandidat milik mitra & hari yang sama.
 *
 * Tingkat keyakinan:
 *   high      — satu-satunya kandidat bernomor sama dalam toleransi
 *   low       — cocok tapi selisih waktunya besar
 *   conflict  — beberapa kandidat sama-sama masuk; JANGAN tebak, minta ditinjau
 *   unmatched — tidak ada kandidat
 */
export function cocokkanRekaman(
  rec: ParsedRecording,
  kandidat: KandidatSesi[],
  toleransiDetik = 120,
): HasilCocok {
  if (!rec.phoneE164) {
    return { sessionId: null, confidence: 'unmatched', deltaDetik: null,
             alasan: 'Nomor tidak terbaca dari nama berkas' };
  }
  if (!rec.startedAt) {
    return { sessionId: null, confidence: 'unmatched', deltaDetik: null,
             alasan: 'Waktu tidak terbaca dari nama berkas' };
  }

  const waktu = rec.startedAt.getTime();
  const senomor = kandidat.filter(k => k.phoneE164 === rec.phoneE164);

  if (senomor.length === 0) {
    return { sessionId: null, confidence: 'unmatched', deltaDetik: null,
             alasan: 'Tidak ada sesi dengan nomor ini pada hari tersebut' };
  }

  const berjarak = senomor
    .map(k => ({ k, delta: Math.round(Math.abs(k.startedAt.getTime() - waktu) / 1000) }))
    .sort((a, b) => a.delta - b.delta);

  const dalamToleransi = berjarak.filter(x => x.delta <= toleransiDetik);

  if (dalamToleransi.length === 1) {
    const { k, delta } = dalamToleransi[0]!;
    return { sessionId: k.id, confidence: 'high', deltaDetik: delta,
             alasan: `Cocok tunggal, selisih ${delta} detik` };
  }

  if (dalamToleransi.length > 1) {
    // Dua panggilan ke nomor sama dalam 2 menit. Menebak di sini berisiko
    // menempelkan rekaman ke sesi yang salah — biarkan manusia yang putuskan.
    return { sessionId: null, confidence: 'conflict', deltaDetik: dalamToleransi[0]!.delta,
             alasan: `${dalamToleransi.length} sesi sama-sama masuk toleransi` };
  }

  const terdekat = berjarak[0]!;
  if (terdekat.delta <= toleransiDetik * 5) {
    return { sessionId: terdekat.k.id, confidence: 'low', deltaDetik: terdekat.delta,
             alasan: `Di luar toleransi, selisih ${terdekat.delta} detik — perlu ditinjau` };
  }

  return { sessionId: null, confidence: 'unmatched', deltaDetik: terdekat.delta,
           alasan: `Kandidat terdekat berselisih ${terdekat.delta} detik` };
}
