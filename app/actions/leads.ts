"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ClaimLeadsResult {
  success: boolean;
  claimed?: number;
  error?: string;
}

/** Drip-feed queue: claims a batch of Uncalled, unassigned contacts atomically. */
export async function claimLeads(batchSize = 15): Promise<ClaimLeadsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

  const clamped = Math.min(Math.max(batchSize, 10), 20);
  const { data, error } = await supabase.rpc("assign_contacts_to_agent", {
    p_agent_id: user.id,
    p_batch_size: clamped,
  });

  if (error) return { success: false, error: error.message };

  // RPC sekarang RETURNS TABLE(assigned_count, rejected_reason) - satu
  // baris, bukan lagi setof contacts. Lihat 0010_active_slot_capacity.sql.
  const result = data?.[0];
  if (!result) return { success: false, error: "Tidak ada respons dari server." };
  if (result.rejected_reason) {
    return { success: false, error: result.rejected_reason };
  }

  revalidatePath("/agent/dashboard");
  revalidatePath("/agent/queue");
  return { success: true, claimed: result.assigned_count ?? 0 };
}
