"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface MarkReengagementSentResult {
  success: boolean;
  error?: string;
}

/**
 * Dipanggil setelah agen konfirmasi sudah kirim WA re-engagement manual
 * (bukan auto-send - lihat components/agent/ReengagementActions.tsx).
 * Mencatat timestamp supaya kontak yang sama tidak muncul lagi di daftar
 * sebelum 30 hari berikutnya (lihat v_reengagement_leads).
 */
export async function markReengagementSent(
  contactId: string
): Promise<MarkReengagementSentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

  const { error } = await supabase
    .from("contacts")
    .update({ last_reengagement_sent_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("assigned_to", user.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/agent/reengagement");
  return { success: true };
}
