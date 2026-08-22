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

  revalidatePath("/agent/dashboard");
  return { success: true, claimed: data?.length ?? 0 };
}
