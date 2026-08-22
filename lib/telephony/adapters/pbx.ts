// lib/telephony/adapters/pbx.ts
//
// OPSI 3 — Cloud PBX / softphone.  ← DIBANGUN, BELUM DIAKTIFKAN
//
// Kontrak di types.ts diturunkan dari kemampuan berkas ini. Karena itu
// mengaktifkannya nanti hanya perlu:
//   1. isi kredensial di .env
//   2. ubah system_config.telephony_provider = 'pbx'
//   3. daftarkan URL webhook di dashboard provider
// Tidak ada kode pemanggil yang perlu disentuh.
//
// PEMICU PINDAH (sepakati sekarang, jangan ditunda):
//   mitra ke-3 masuk  ATAU  selisih rekonsiliasi pertama  ATAU  bulan ke-3
//   — mana yang lebih dulu.

import type {
  TelephonyProvider, ProviderCapabilities, InitiateCallInput,
  CallHandle, IngestInput, IngestResult, CallOutcome,
} from '../types';
import { normalisasiNomor } from '../phone';

/**
 * Bentuk webhook yang diharapkan. Sebagian besar PBX cloud (3CX, Twilio,
 * Vonage, atau penyedia lokal Indonesia) mengirim sesuatu yang mirip;
 * yang berbeda hanya nama field.
 *
 * Saat memilih provider nanti, JANGAN ubah tipe ini — tulis fungsi
 * pemetaan dari payload mereka ke bentuk ini. Itu menjaga sisa sistem
 * tidak ikut berubah.
 */
export interface PbxWebhookEvent {
  event: 'call.initiated' | 'call.answered' | 'call.completed' | 'recording.ready';
  callId: string;
  agentExtension: string;
  direction: 'outbound' | 'inbound';
  from: string;
  to: string;
  startedAt: string;              // ISO 8601
  answeredAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  talkTimeSeconds?: number;
  disposition?: 'answered' | 'no-answer' | 'busy' | 'failed' | 'cancelled';
  recordingUrl?: string;
}

export interface PbxDeps {
  /** Peta extension PBX -> users.id. Isi saat menyiapkan akun mitra. */
  agentIdDariExtension(ext: string): Promise<string | null>;
  contactIdDariNomor(phoneE164: string): Promise<string | null>;
  upsertSesi(row: {
    externalCallId: string; agentId: string; contactId: string | null;
    phoneE164: string; startedAt: Date; endedAt: Date | null;
    talkTimeDetik: number | null; outcome: CallOutcome;
  }): Promise<{ dibuat: boolean; sessionId: string }>;
  simpanUrlRekaman(externalCallId: string, url: string): Promise<void>;
  urlRekamanSesi(sessionId: string): Promise<string | null>;
  /** POST ke API originate milik provider. */
  originate(input: { ext: string; tujuan: string }): Promise<{ callId: string }>;
  extensionDariAgent(agentId: string): Promise<string | null>;
}

function petakanDisposition(d?: string): CallOutcome {
  switch (d) {
    case 'answered':  return 'answered';
    case 'no-answer':
    case 'cancelled': return 'no_answer';
    case 'busy':      return 'busy';
    case 'failed':    return 'failed';
    default:          return 'unknown';
  }
}

export class PbxProvider implements TelephonyProvider {
  readonly kind = 'pbx' as const;

  readonly capabilities: ProviderCapabilities = {
    realtime: true,
    authoritativeDuration: true,
    autoRecording: true,
    clickToCall: true,
    fraudProof: true,   // tidak perlu rekonsiliasi — bukti datang dari sistem
  };

  constructor(private deps: PbxDeps) {}

  async initiateCall(input: InitiateCallInput): Promise<CallHandle> {
    const ext = await this.deps.extensionDariAgent(input.agentId);
    if (!ext) throw new Error(`Mitra ${input.agentId} belum punya extension PBX`);

    const { callId } = await this.deps.originate({ ext, tujuan: input.phoneE164 });
    return { sessionId: null, externalCallId: callId, dialUri: null, mulaiSekarang: true };
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    const ev = input.webhookPayload as PbxWebhookEvent | undefined;
    const kosong: IngestResult = {
      sesiDibuat: 0, sesiDiperbarui: 0, rekamanDicocokkan: 0,
      rekamanPerluTinjau: 0, barisDibuang: 0, peringatan: [],
    };
    if (!ev?.callId) return { ...kosong, peringatan: ['Payload webhook tanpa callId'] };

    // Rekaman menyusul beberapa detik setelah panggilan selesai
    if (ev.event === 'recording.ready') {
      if (ev.recordingUrl) await this.deps.simpanUrlRekaman(ev.callId, ev.recordingUrl);
      return { ...kosong, rekamanDicocokkan: 1 };
    }

    // Hanya panggilan keluar yang merupakan aktivitas telemarketing
    if (ev.direction !== 'outbound') return { ...kosong, barisDibuang: 1 };

    const agentId = await this.deps.agentIdDariExtension(ev.agentExtension);
    if (!agentId) {
      return { ...kosong, peringatan: [`Extension ${ev.agentExtension} tidak dikenal`] };
    }

    const phoneE164 = normalisasiNomor(ev.to);
    if (!phoneE164) return { ...kosong, barisDibuang: 1 };

    const { dibuat } = await this.deps.upsertSesi({
      externalCallId: ev.callId,
      agentId,
      contactId: await this.deps.contactIdDariNomor(phoneE164),
      phoneE164,
      startedAt: new Date(ev.startedAt),
      endedAt: ev.endedAt ? new Date(ev.endedAt) : null,
      talkTimeDetik: ev.talkTimeSeconds ?? null,
      outcome: petakanDisposition(ev.disposition),
    });

    return { ...kosong, sesiDibuat: dibuat ? 1 : 0, sesiDiperbarui: dibuat ? 0 : 1 };
  }

  async getRecordingUrl(sessionId: string): Promise<string | null> {
    return this.deps.urlRekamanSesi(sessionId);
  }

  buktiCukupTanpaRekonsiliasi(): boolean {
    return true;
  }
}
