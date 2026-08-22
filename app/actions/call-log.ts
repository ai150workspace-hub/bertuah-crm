"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validasiHasil, efekSamping } from "@/lib/call-outcome/derive";
import type { KodeHasil, KodeSubAlasan } from "@/lib/call-outcome/catalog";

export interface SaveCallLogInput {
  contactId: string;
  kode: KodeHasil;
  subAlasan?: KodeSubAlasan | null;
  tanggalFollowup?: string | null;
  simulasiNominal?: number | null;
  simulasiTenor?: number | null;
  notes?: string | null;
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
    })
    .eq("id", input.contactId)
    .eq("assigned_to", user.id);
  if (contactError) return { success: false, error: contactError.message };

  revalidatePath("/agent/dashboard");
  return { success: true, statusKontak: efek.statusKontak };
}
