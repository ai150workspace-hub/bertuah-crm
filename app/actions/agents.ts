"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AgentActionResult {
  success: boolean;
  error?: string;
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Belum login." };

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { ok: false, error: "Hanya admin yang boleh melakukan ini." };

  return { ok: true };
}

export async function pauseAgent(agentId: string, reason: string): Promise<AgentActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };
  if (!reason.trim()) return { success: false, error: "Alasan pause wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("pause_agent", {
    p_agent_id: agentId,
    p_reason: reason.trim(),
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/agents");
  return { success: true };
}

export async function resumeAgent(agentId: string): Promise<AgentActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("resume_agent", { p_agent_id: agentId });
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/agents");
  return { success: true };
}

export async function deactivateAgent(agentId: string): Promise<AgentActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_agent", { p_agent_id: agentId });
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/agents");
  revalidatePath("/admin/contacts");
  return { success: true };
}
