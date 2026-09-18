"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { validasiHasil, efekSamping } from "@/lib/call-outcome/derive";
import { HASIL_PANGGILAN, type KodeHasil, type KodeSubAlasan } from "@/lib/call-outcome/catalog";

const HASIL_LABEL = new Map(HASIL_PANGGILAN.map((h) => [h.kode, h.label]));

export interface SaveCallLogInput {
  contactId: string;
  kode: KodeHasil;
  subAlasan?: KodeSubAlasan | null;
  tanggalFollowup?: string | null;
  simulasiNominal?: number | null;
  simulasiTenor?: number | null;
  /** Cicilan/bulan - opsional, diisi manual agen (tidak dihitung dari rate). */
  simulasiAngsuran?: number | null;
  notes?: string | null;
  /** Alasan jadwal follow-up > 7 hari (WIB) - divalidasi ulang di DB (migrasi 0026). */
  alasanJadwalPanjang?: string | null;
}

export interface SaveCallLogResult {
  success: boolean;
  error?: string;
  statusKontak?: string;
}

export async function saveCallLog(
  input: SaveCallLogInput
): Promise<SaveCallLogResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

  // Server-side validation — jangan percaya validasi klien (Prompt 10).
  const validasi = validasiHasil({
    kode: input.kode,
    subAlasan: input.subAlasan ?? null,
    tanggalFollowup: input.tanggalFollowup ?? null,
    simulasiNominal: input.simulasiNominal ?? null,
    simulasiTenor: input.simulasiTenor ?? null,
    catatan: input.notes ?? null,
  });
  if (!validasi.valid) {
    return { success: false, error: validasi.error[0] };
  }

  const efek = efekSamping({
    kode: input.kode,
    subAlasan: input.subAlasan ?? null,
    tanggalFollowup: input.tanggalFollowup ?? null,
  });

  const { error: logError } = await supabase.from("call_logs").insert({
    contact_id: input.contactId,
    agent_id: user.id,
    hasil: input.kode,
    sub_alasan: input.subAlasan ?? null,
    call_notes: input.notes ?? null,
    callback_date: efek.jadwalkanPada ? efek.jadwalkanPada.toISOString() : null,
    simulasi_nominal: input.simulasiNominal ?? null,
    simulasi_tenor: input.simulasiTenor ?? null,
    simulasi_angsuran: input.simulasiAngsuran ?? null,
  });
  // JANGAN isi level_1..level_4 lagi — hasil/sub_alasan yang jadi sumber
  // kebenaran sekarang (lihat migrasi 0003 dan docs/TELEPHONY.md Prompt 10).
  if (logError) return { success: false, error: logError.message };

  // masukDnc sudah ditangani trigger DB (trg_jangan_hubungi) — tidak
  // digandakan di sini.
  const { error: contactError } = await supabase
    .from("contacts")
    .update({
      // status_prospek bukan lagi ditulis di sini — check constraint-nya
      // (0001) masih mengikat nilai pohon lama ('Interest'/'Prospect'/dst),
      // sementara `hasil` di call_logs sekarang sumber kebenarannya.
      status_call: efek.statusKontak,
      last_contacted_at: new Date().toISOString(),
      next_follow_up_at: efek.jadwalkanPada ? efek.jadwalkanPada.toISOString() : null,
      alasan_jadwal_panjang: input.alasanJadwalPanjang ?? null,
    })
    .eq("id", input.contactId)
    .eq("assigned_to", user.id);
  if (contactError) return { success: false, error: contactError.message };

  revalidatePath("/agent/dashboard");
  return { success: true, statusKontak: efek.statusKontak };
}

export interface PreviousCallHistoryEntry {
  timestamp: string;
  agentFirstName: string;
  hasilLabel: string;
  notes: string | null;
  /** true kalau log ini milik agen yang sedang login (bukan agen lain). */
  isOwn: boolean;
}

interface PreviousCallLogRow {
  timestamp: string;
  hasil: string | null;
  call_notes: string | null;
  agent_id: string;
  users: { name: string } | { name: string }[] | null;
}

function agentNameOf(u: PreviousCallLogRow["users"]): string {
  const row = Array.isArray(u) ? u[0] : u;
  return row?.name ?? "Agen";
}

/**
 * Ringkasan call log pada kontak ini — milik agen yang sedang login
 * MAUPUN agen lain — supaya agen (a) punya konteks kalau kontak ini
 * sebelumnya ditangani agen lain (recycled), dan (b) sejak program
 * percobaan ulang (menelepon ulang nomor yang sama 2-3 kali) bisa lihat
 * catatannya sendiri dari panggilan sebelumnya, tanpa mengekspos nomor
 * HP agen lain atau catatan internal yang penuh untuk log yang bukan
 * miliknya.
 */
export async function getPreviousCallHistory(
  contactId: string
): Promise<PreviousCallHistoryEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Penjaga keamanan: siapa pun yang minta, kontak ini harus memang
  // sedang di-assign ke agen yang login. RLS call_logs cuma izinkan
  // agent lihat log miliknya sendiri (by design) - riwayat gabungan
  // (termasuk log agen lain) di sini tetap butuh service role, jadi cek
  // kepemilikan kontak ini dilakukan manual dulu sebelum query itu.
  const { data: contact } = await supabase
    .from("contacts")
    .select("assigned_to")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact || contact.assigned_to !== user.id) return [];

  const service = createServiceRoleClient();
  const { data } = await service
    .from("call_logs")
    .select("timestamp, hasil, call_notes, agent_id, users(name)")
    .eq("contact_id", contactId)
    .order("timestamp", { ascending: false })
    .limit(8);

  return ((data ?? []) as unknown as PreviousCallLogRow[]).map((row) => {
    const isOwn = row.agent_id === user.id;
    return {
      timestamp: row.timestamp,
      agentFirstName: agentNameOf(row.users).split(" ")[0] ?? "Agen",
      hasilLabel: row.hasil ? (HASIL_LABEL.get(row.hasil as KodeHasil) ?? row.hasil) : "—",
      // Punya sendiri boleh dibaca penuh (300 karakter) - catatan agen
      // lain tetap dipotong pendek (100) seperti semula.
      notes: row.call_notes ? row.call_notes.slice(0, isOwn ? 300 : 100) : null,
      isOwn,
    };
  });
}
