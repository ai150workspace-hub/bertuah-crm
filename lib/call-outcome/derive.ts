// lib/call-outcome/derive.ts
//
// Turunan dari satu kode hasil: status kontak, field wajib, aksi otomatis,
// dan apakah panggilan ini dihitung sebagai RPC.
//
// Semua konsekuensi dipusatkan di sini. Jangan menyebar `if (kode === ...)`
// ke komponen — begitu logikanya tersebar, dua tempat akan berbeda dan
// laporanmu berhenti bisa dipercaya.

import {
  HASIL_PANGGILAN, SUB_ALASAN_TIDAK_LAYAK,
  type KodeHasil, type KodeSubAlasan, type StatusKontak,
} from './catalog';

const PETA = new Map(HASIL_PANGGILAN.map(h => [h.kode, h]));

export function infoHasil(kode: KodeHasil) {
  const h = PETA.get(kode);
  if (!h) throw new Error(`Kode hasil tidak dikenal: ${kode}`);
  return h;
}

export function semuaKode(): KodeHasil[] {
  return HASIL_PANGGILAN.map(h => h.kode);
}

/** Panggilan ini dihitung sebagai Right Party Contact? */
export function adalahRpc(kode: KodeHasil): boolean {
  return infoHasil(kode).rpc;
}

export function statusKontakDari(kode: KodeHasil): StatusKontak {
  return infoHasil(kode).statusKontak;
}

export interface InputHasil {
  kode: KodeHasil;
  subAlasan?: KodeSubAlasan | null;
  tanggalFollowup?: string | Date | null;
  simulasiNominal?: number | null;
  simulasiTenor?: number | null;
}

export interface HasilValidasi {
  valid: boolean;
  error: string[];
}

/**
 * Validasi sebelum simpan. Pesan ditulis untuk mitra, bukan untuk developer —
 * mereka yang membacanya 80 kali sehari.
 */
export function validasiHasil(input: InputHasil): HasilValidasi {
  const error: string[] = [];
  let h;
  try { h = infoHasil(input.kode); }
  catch { return { valid: false, error: ['Pilih dulu hasil panggilannya.'] }; }

  const wajib = h.wajib as readonly string[];

  if (wajib.includes('sub_alasan')) {
    const sah = SUB_ALASAN_TIDAK_LAYAK.some(s => s.kode === input.subAlasan);
    if (!sah) error.push('Pilih alasan kenapa tidak lolos syarat.');
  }

  if (wajib.includes('tanggal_followup')) {
    if (!input.tanggalFollowup) {
      error.push('Isi tanggal untuk ditindaklanjuti.');
    } else {
      const t = new Date(input.tanggalFollowup);
      if (Number.isNaN(t.getTime())) error.push('Tanggal tindak lanjut tidak valid.');
      else if (t.getTime() < Date.now() - 24 * 3600 * 1000)
        error.push('Tanggal tindak lanjut tidak boleh di masa lalu.');
    }
  }

  if (wajib.includes('simulasi')) {
    if (!input.simulasiNominal || input.simulasiNominal <= 0)
      error.push('Isi nominal simulasi yang kamu sampaikan ke nasabah.');
    if (!input.simulasiTenor || input.simulasiTenor <= 0)
      error.push('Isi tenor simulasi.');
  }

  return { valid: error.length === 0, error };
}

export interface EfekSamping {
  statusKontak: StatusKontak;
  /** Kembalikan ke pool supaya mitra lain bisa mencoba? */
  lepasAssignment: boolean;
  /** Masukkan ke do_not_contact — POJK 6/2022. */
  masukDnc: boolean;
  /** Jadwalkan pengingat otomatis pada tanggal ini. */
  jadwalkanPada: Date | null;
  /** Tandai untuk dikirimi simulasi WA. */
  dorongKirimWa: boolean;
}

/** Satu-satunya tempat yang memutuskan apa yang terjadi setelah panggilan dicatat. */
export function efekSamping(input: InputHasil, sekarang = new Date()): EfekSamping {
  const h = infoHasil(input.kode);

  let jadwalkanPada: Date | null = null;
  if (input.tanggalFollowup) {
    const t = new Date(input.tanggalFollowup);
    if (!Number.isNaN(t.getTime())) jadwalkanPada = t;
  }
  // Pikir-pikir tidak minta tanggal ke mitra — sistem yang menjadwalkan H+3,
  // supaya prospek hangat tidak menguap karena lupa.
  if (input.kode === 'PIKIR_PIKIR' && !jadwalkanPada) {
    jadwalkanPada = new Date(sekarang.getTime() + 3 * 24 * 3600 * 1000);
  }

  return {
    statusKontak: h.statusKontak,
    // Closed & Invalid tidak dilepas: kontaknya sudah selesai, melepasnya
    // hanya akan membuat mitra lain menelepon orang yang sudah menolak.
    lepasAssignment: false,
    masukDnc: input.kode === 'JANGAN_HUBUNGI',
    jadwalkanPada,
    dorongKirimWa: input.kode === 'MINAT',
  };
}

// ---------------------------------------------------------------------
// Pemetaan dari pohon lama — dipakai migrasi DAN sebagai jaring pengaman
// ---------------------------------------------------------------------

/**
 * Peta pohon 4 tingkat lama -> kode datar baru.
 * Tidak ada satu pun dari 13 alasan Unprospect lama yang hilang; semuanya
 * mendarat di kode + sub-alasan yang setara.
 */
export function dariPohonLama(l: {
  level_1?: string | null; level_2?: string | null;
  level_3?: string | null; level_4?: string | null; level_4_detail?: string | null;
}): { kode: KodeHasil; subAlasan: KodeSubAlasan | null } {
  const d = (l.level_4_detail ?? '').trim();
  const l4 = (l.level_4 ?? '').trim();
  const l3 = (l.level_3 ?? '').trim();
  const l2 = (l.level_2 ?? '').trim();

  // Invalid Number
  if (l3 === 'Konsumen Meninggal') return { kode: 'JANGAN_HUBUNGI', subAlasan: null };
  if (l3 === 'No Salah' || l3 === 'Bad Rating') return { kode: 'NOMOR_SALAH', subAlasan: null };
  if (l2 === 'Invalid Number') return { kode: 'NOMOR_SALAH', subAlasan: null };

  // Uncontacted — inilah yang dulu keliru dihitung sebagai "connected"
  if (l2 === 'Uncontacted') return { kode: 'TIDAK_DIANGKAT', subAlasan: null };

  // Unpresent
  if (l3 === 'Unpresent') {
    if (l4 === 'Callback') return { kode: 'MINTA_TELEPON_LAIN', subAlasan: null };
    if (l4 === 'Meeting')  return { kode: 'JANJI_TEMU', subAlasan: null };
    if (l4 === 'Reject Front') return { kode: 'TOLAK_BUTUH', subAlasan: null };
    return { kode: 'BUKAN_ORANGNYA', subAlasan: null };
  }

  // Present
  if (l4 === 'Interest' || l4 === 'Prospect') return { kode: 'MINAT', subAlasan: null };

  if (l4 === 'Unprospect') {
    switch (d) {
      case 'Kendaraan Masih Kredit':
      case 'Angsuran Masih Banyak':
        return { kode: 'TIDAK_MEMENUHI_SYARAT', subAlasan: 'BPKB_MASIH_KREDIT' };
      case 'Invalid Data':
        return { kode: 'TIDAK_MEMENUHI_SYARAT', subAlasan: 'BPKB_BUKAN_ATAS_NAMA' };
      case 'No Coverage Area':
        return { kode: 'TIDAK_MEMENUHI_SYARAT', subAlasan: 'LUAR_COVERAGE' };
      case 'Pricing':
      case 'Dana Cari Rendah':
        return { kode: 'TOLAK_HARGA', subAlasan: null };
      case 'No Need Money':
      case 'Dana Sudah Cair':
        return { kode: 'TOLAK_BUTUH', subAlasan: null };
      case 'Konfirmasi Pasangan':
        return { kode: 'KONFIRMASI_PASANGAN', subAlasan: null };
      case 'Masih Pikir-pikir':
      case 'Inquiry':
        return { kode: 'PIKIR_PIKIR', subAlasan: null };
      case 'Service':
        return { kode: 'TOLAK_HARGA', subAlasan: null };
      default:
        return { kode: 'TIDAK_MEMENUHI_SYARAT', subAlasan: 'LAINNYA' };
    }
  }

  return { kode: 'TIDAK_DIANGKAT', subAlasan: null };
}
