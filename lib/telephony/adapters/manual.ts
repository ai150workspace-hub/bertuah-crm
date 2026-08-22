// lib/telephony/adapters/manual.ts
//
// OPSI 1 — HP Android + aplikasi perekam, unggah harian.  ← AKTIF SEKARANG
//
// Adapter ini memenuhi kontrak yang sama dengan PBX, hanya dengan bukti
// yang lebih lemah dan datang terlambat. Yang membuatnya tetap berguna
// bukan rekamannya, melainkan CALL LOG PERANGKAT yang diadu dengan
// call_logs CRM (lihat reconcile.ts).

import type {
  TelephonyProvider, ProviderCapabilities, InitiateCallInput,
  CallHandle, IngestInput, IngestResult, RawCallRecord, CallOutcome,
} from '../types';
import { normalisasiNomor, telUri } from '../phone';
import { parseNamaBerkas, cocokkanRekaman, type KandidatSesi } from '../match';

// ---------------------------------------------------------------------
// Parser CSV call log perangkat
// ---------------------------------------------------------------------
// Aplikasi ekspor call log menamai kolom berbeda-beda. Deteksi kolom dari
// header alih-alih mengandalkan urutan — urutan kolom berubah antar versi
// aplikasi dan itu akan diam-diam merusak rekonsiliasi.

const ALIAS = {
  nomor:   ['number','phone','phone number','nomor','no','no hp','nomor telepon'],
  tipe:    ['type','call type','tipe','jenis'],
  tanggal: ['date','datetime','time','tanggal','waktu','call date'],
  durasi:  ['duration','durasi','duration (s)','lama'],
} as const;

function cariKolom(header: string[], alias: readonly string[]): number {
  const bersih = header.map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  for (const a of alias) {
    const i = bersih.indexOf(a);
    if (i >= 0) return i;
  }
  // pencocokan longgar sebagai cadangan
  for (let i = 0; i < bersih.length; i++) {
    if (alias.some(a => bersih[i]!.includes(a))) return i;
  }
  return -1;
}

function belahBaris(baris: string): string[] {
  // CSV sederhana dengan dukungan tanda kutip
  const out: string[] = [];
  let cur = '', dalamKutip = false;
  for (let i = 0; i < baris.length; i++) {
    const c = baris[i];
    if (c === '"') {
      if (dalamKutip && baris[i + 1] === '"') { cur += '"'; i++; }
      else dalamKutip = !dalamKutip;
    } else if ((c === ',' || c === ';') && !dalamKutip) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseWaktu(raw: string): Date | null {
  const s = raw.trim().replace(/^["']|["']$/g, '');
  if (!s) return null;

  // epoch milidetik (beberapa aplikasi mengekspor apa adanya)
  if (/^\d{13}$/.test(s)) return new Date(parseInt(s, 10));
  if (/^\d{10}$/.test(s)) return new Date(parseInt(s, 10) * 1000);

  // '2026-08-21 14:30:22' / '21/08/2026 14:30' / '21-08-2026 14.30.22'
  const m = s.match(
    /(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})[\sT]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?/,
  );
  if (m) {
    const [, a, b, c, h, mi, se] = m;
    let Y: number, M: number, D: number;
    if (a!.length === 4) { Y = +a!; M = +b!; D = +c!; }   // YYYY-MM-DD
    else                 { D = +a!; M = +b!; Y = +c!; }   // DD/MM/YYYY (lazim di Indonesia)
    if (Y < 100) Y += 2000;
    // Waktu perangkat ada di WIB (UTC+7)
    const t = Date.UTC(Y, M - 1, D, +h! - 7, +mi!, se ? +se : 0);
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function petakanOutcome(tipe: string, durasi: number): CallOutcome {
  const t = tipe.toLowerCase();
  if (t.includes('miss') || t.includes('tak terjawab')) return 'no_answer';
  if (t.includes('reject') || t.includes('tolak'))      return 'busy';
  if (durasi > 0) return 'answered';
  return 'no_answer';
}

export interface HasilParseCsv {
  records: RawCallRecord[];
  barisTotal: number;
  barisDibuang: number;
  peringatan: string[];
}

/**
 * Parse CSV call log perangkat.
 *
 * `nomorDikenal` adalah daftar nomor yang ADA di tabel contacts.
 * Baris di luar daftar itu DIBUANG dan tidak pernah disimpan — panggilan
 * pribadi mitra bukan urusan sistem ini. Ini sekaligus minimisasi data
 * sesuai UU PDP, dan menjaga kepercayaan mitra pada sistemnya.
 */
export function parseDeviceCallLog(csv: string, nomorDikenal: Set<string>): HasilParseCsv {
  const peringatan: string[] = [];
  const baris = csv.split(/\r?\n/).filter(b => b.trim());
  if (baris.length < 2) {
    return { records: [], barisTotal: 0, barisDibuang: 0, peringatan: ['CSV kosong atau tanpa header'] };
  }

  const header = belahBaris(baris[0]!);
  const iNomor   = cariKolom(header, ALIAS.nomor);
  const iTipe    = cariKolom(header, ALIAS.tipe);
  const iTanggal = cariKolom(header, ALIAS.tanggal);
  const iDurasi  = cariKolom(header, ALIAS.durasi);

  if (iNomor < 0 || iTanggal < 0) {
    return {
      records: [], barisTotal: baris.length - 1, barisDibuang: 0,
      peringatan: [`Kolom nomor/tanggal tidak ditemukan. Header terbaca: ${header.join(' | ')}`],
    };
  }

  const records: RawCallRecord[] = [];
  let dibuang = 0;

  for (let i = 1; i < baris.length; i++) {
    const kol = belahBaris(baris[i]!);
    const nomor = normalisasiNomor(kol[iNomor]);
    if (!nomor) { dibuang++; continue; }

    // Hanya nomor yang ada di contacts yang disimpan.
    if (!nomorDikenal.has(nomor)) { dibuang++; continue; }

    const mulai = parseWaktu(kol[iTanggal] ?? '');
    if (!mulai) { dibuang++; continue; }

    const durasi = Math.max(0, parseInt(kol[iDurasi] ?? '0', 10) || 0);
    const tipe   = kol[iTipe] ?? '';

    // Panggilan masuk bukan aktivitas telemarketing keluar — jangan dihitung.
    if (tipe.toLowerCase().includes('incoming') || tipe.toLowerCase().includes('masuk')) {
      dibuang++; continue;
    }

    records.push({
      phoneE164: nomor,
      startedAt: mulai,
      durasiDetik: durasi,
      outcome: petakanOutcome(tipe, durasi),
    });
  }

  if (records.length === 0 && baris.length > 1) {
    peringatan.push('Tidak ada baris yang cocok dengan kontak mana pun — periksa format ekspor.');
  }

  return { records, barisTotal: baris.length - 1, barisDibuang: dibuang, peringatan };
}

// ---------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------

export interface ManualDeps {
  /** Nomor E.164 seluruh contacts — untuk menyaring panggilan pribadi. */
  ambilNomorDikenal(): Promise<Set<string>>;
  /** Sesi milik mitra pada tanggal tsb, untuk mencocokkan rekaman. */
  ambilSesiHari(agentId: string, tanggal: string): Promise<KandidatSesi[]>;
  simpanSesi(rows: Array<RawCallRecord & { agentId: string }>): Promise<{ dibuat: number; diperbarui: number }>;
  simpanRekaman(rows: Array<{
    agentId: string; storagePath: string; parsedPhone: string | null;
    parsedStartedAt: Date | null; sessionId: string | null;
    confidence: string; deltaDetik: number | null; ukuranBytes: number;
  }>): Promise<void>;
  catatImpor(row: {
    agentId: string; tanggal: string; barisTotal: number; barisRelevan: number;
    barisDibuang: number; rekamanDiunggah: number; status: string; catatanError?: string;
  }): Promise<void>;
  signedUrl(storagePath: string): Promise<string | null>;
  storagePathSesi(sessionId: string): Promise<string | null>;
  toleransiCocokDetik(): Promise<number>;
}

export class ManualProvider implements TelephonyProvider {
  readonly kind = 'manual' as const;

  readonly capabilities: ProviderCapabilities = {
    realtime: false,
    authoritativeDuration: true,  // dari call log perangkat, bukan ketikan mitra
    autoRecording: false,         // mitra harus mengunggah sendiri
    clickToCall: false,           // hanya membuka tel:
    fraudProof: false,            // WAJIB dilengkapi reconcile.ts
  };

  constructor(private deps: ManualDeps) {}

  async initiateCall(input: InitiateCallInput): Promise<CallHandle> {
    // Tidak ada yang bisa di-originate. Serahkan ke perangkat mitra.
    return {
      sessionId: null,
      externalCallId: null,
      dialUri: telUri(input.phoneE164),
      mulaiSekarang: false,
    };
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    const peringatan: string[] = [];

    if (!input.deviceLogCsv) {
      // Ini bukan sekadar peringatan — tanpa call log, unggahan hari itu
      // tidak punya nilai anti-fraud sama sekali.
      peringatan.push(
        'Call log perangkat tidak disertakan. Rekaman saja tidak bisa membuktikan ' +
        'panggilan mana yang benar terjadi — rekonsiliasi hari ini tidak bisa dijalankan.',
      );
    }

    const nomorDikenal = await this.deps.ambilNomorDikenal();
    const parsed = input.deviceLogCsv
      ? parseDeviceCallLog(input.deviceLogCsv, nomorDikenal)
      : { records: [], barisTotal: 0, barisDibuang: 0, peringatan: [] as string[] };

    peringatan.push(...parsed.peringatan);

    const { dibuat, diperbarui } = await this.deps.simpanSesi(
      parsed.records.map(r => ({ ...r, agentId: input.agentId })),
    );

    // --- cocokkan rekaman ---
    let dicocokkan = 0, perluTinjau = 0;
    if (input.recordings?.length) {
      const kandidat = await this.deps.ambilSesiHari(input.agentId, input.tanggal);
      const toleransi = await this.deps.toleransiCocokDetik();

      const rows = input.recordings.map(rec => {
        const p = parseNamaBerkas(rec.namaBerkas);
        const hasil = cocokkanRekaman(p, kandidat, toleransi);
        if (hasil.confidence === 'high' || hasil.confidence === 'exact') dicocokkan++;
        else perluTinjau++;
        return {
          agentId: input.agentId,
          storagePath: rec.storagePath,
          parsedPhone: p.phoneE164,
          parsedStartedAt: p.startedAt,
          sessionId: hasil.sessionId,
          confidence: hasil.confidence,
          deltaDetik: hasil.deltaDetik,
          ukuranBytes: rec.ukuranBytes,
        };
      });

      await this.deps.simpanRekaman(rows);
    }

    await this.deps.catatImpor({
      agentId: input.agentId,
      tanggal: input.tanggal,
      barisTotal: parsed.barisTotal,
      barisRelevan: parsed.records.length,
      barisDibuang: parsed.barisDibuang,
      rekamanDiunggah: input.recordings?.length ?? 0,
      status: peringatan.length && !parsed.records.length ? 'Gagal' : 'Selesai',
      catatanError: peringatan.join(' | ') || undefined,
    });

    return {
      sesiDibuat: dibuat,
      sesiDiperbarui: diperbarui,
      rekamanDicocokkan: dicocokkan,
      rekamanPerluTinjau: perluTinjau,
      barisDibuang: parsed.barisDibuang,
      peringatan,
    };
  }

  async getRecordingUrl(sessionId: string): Promise<string | null> {
    const path = await this.deps.storagePathSesi(sessionId);
    return path ? this.deps.signedUrl(path) : null;
  }

  buktiCukupTanpaRekonsiliasi(): boolean {
    return false;   // selalu jalankan reconcile.ts pada adapter ini
  }
}
