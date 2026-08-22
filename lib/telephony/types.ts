// lib/telephony/types.ts
//
// KONTRAK LAPISAN TELEPON
//
// Aturan desain yang menentukan bentuk berkas ini:
// interface ini diturunkan dari kemampuan Cloud PBX (paling menuntut),
// lalu adapter yang lebih lemah memenuhinya semampunya. BUKAN sebaliknya.
//
// Kalau kontrak ini dibentuk dari alur "unggah harian", ia akan jadi
// interface bergaya tarik/batch, dan PBX yang berbasis dorong/webhook
// tidak akan muat — lalu kamu rewrite. Itu justru yang mau dihindari.

export type ProviderKind = 'manual' | 'gsm_log' | 'pbx';

export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'failed' | 'unknown';

export type MatchConfidence = 'exact' | 'high' | 'low' | 'unmatched' | 'conflict';

/**
 * Apa yang SISTEM TELEPON catat — bukan apa yang mitra ketik.
 * Bandingkan dengan CallLog (input mitra) untuk mendeteksi panggilan fiktif.
 */
export interface CallSession {
  id: string;
  callLogId: string | null;      // null = ditelepon tapi tidak dicatat mitra
  contactId: string | null;
  agentId: string;
  phoneE164: string;             // digit saja, mis. '628123456789'
  startedAt: Date;
  endedAt: Date | null;
  talkTimeDetik: number | null;
  outcome: CallOutcome;
  source: ProviderKind;
  externalCallId: string | null; // id otoritatif dari PBX
  verified: boolean;             // ada bukti independen?
  verifiedBy: 'device_log' | 'pbx' | 'admin' | null;
}

/** Kemampuan provider. UI membaca ini untuk menyembunyikan fitur yang belum ada. */
export interface ProviderCapabilities {
  /** Peristiwa masuk saat panggilan sedang terjadi (webhook), bukan besok pagi. */
  realtime: boolean;
  /** Durasi berasal dari sistem, bukan ketikan mitra. Ini syarat KPI yang jujur. */
  authoritativeDuration: boolean;
  /** Rekaman terkumpul otomatis tanpa tindakan mitra. */
  autoRecording: boolean;
  /** Bisa memulai panggilan dari dalam CRM (originate). */
  clickToCall: boolean;
  /** Bukti cukup kuat untuk mendeteksi panggilan fiktif tanpa rekonsiliasi manual. */
  fraudProof: boolean;
}

export interface InitiateCallInput {
  agentId: string;
  contactId: string;
  phoneE164: string;
}

/**
 * Hasil memulai panggilan.
 * - PBX  : panggilan benar-benar di-originate, ada externalCallId.
 * - manual: hanya mengembalikan tel: URI untuk dibuka perangkat mitra.
 */
export interface CallHandle {
  sessionId: string | null;
  externalCallId: string | null;
  dialUri: string | null;        // 'tel:+628...' untuk adapter non-PBX
  mulaiSekarang: boolean;        // true kalau provider benar-benar menelepon
}

/** Satu baris hasil parsing, apa pun sumbernya. */
export interface RawCallRecord {
  phoneE164: string;
  startedAt: Date;
  durasiDetik: number | null;
  outcome: CallOutcome;
  externalCallId?: string;
  recordingRef?: string;         // path/URL rekaman kalau provider menyediakan
}

export interface IngestInput {
  agentId: string;
  tanggal: string;               // 'YYYY-MM-DD' WIB
  /** CSV call log perangkat (opsi manual/gsm_log) */
  deviceLogCsv?: string;
  /** Payload webhook mentah (opsi pbx) */
  webhookPayload?: unknown;
  /** Berkas rekaman yang sudah diunggah ke Storage */
  recordings?: Array<{ storagePath: string; namaBerkas: string; ukuranBytes: number }>;
}

export interface IngestResult {
  sesiDibuat: number;
  sesiDiperbarui: number;
  rekamanDicocokkan: number;
  rekamanPerluTinjau: number;
  barisDibuang: number;          // nomor di luar contacts — dibuang, tidak disimpan
  peringatan: string[];
}

/**
 * Kontrak yang wajib dipenuhi setiap adapter.
 * Menambah provider baru = menulis satu berkas di adapters/, tanpa menyentuh
 * kode pemanggil di mana pun.
 */
export interface TelephonyProvider {
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;

  /** PBX: originate sungguhan. Manual: kembalikan tel: URI. */
  initiateCall(input: InitiateCallInput): Promise<CallHandle>;

  /** PBX: dipanggil webhook. Manual: dipanggil endpoint unggah harian. */
  ingest(input: IngestInput): Promise<IngestResult>;

  /** URL rekaman siap putar (signed URL), atau null kalau belum ada. */
  getRecordingUrl(sessionId: string): Promise<string | null>;

  /**
   * Apakah bukti hari ini bisa dipercaya tanpa rekonsiliasi tambahan.
   * PBX -> true. Manual -> false, sehingga scheduler menjalankan reconcile().
   */
  buktiCukupTanpaRekonsiliasi(): boolean;
}
