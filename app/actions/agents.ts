"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

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

export interface CreateAgentInput {
  name: string;
  email: string;
  password: string;
  kapasitasData: number;
}

const DEFAULT_KAPASITAS = 100;

export async function createAgent(input: CreateAgentInput): Promise<AgentActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { success: false, error: "Nama wajib diisi." };
  if (!email) return { success: false, error: "Email wajib diisi." };
  if (input.password.length < 6) {
    return { success: false, error: "Password minimal 6 karakter." };
  }
  const kapasitasData =
    Number.isFinite(input.kapasitasData) && input.kapasitasData > 0
      ? input.kapasitasData
      : DEFAULT_KAPASITAS;

  // auth.admin.createUser butuh service role - tidak bisa lewat client
  // sesi biasa, dan tidak boleh dipanggil dari browser (kunci service
  // role cuma ada di server). Lihat lib/supabase/service.ts.
  const service = createServiceRoleClient();
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (authError) return { success: false, error: authError.message };

  const { error: profileError } = await service.from("users").insert({
    id: authData.user.id,
    name,
    email,
    role: "agent",
    is_active: true,
    agent_status: "active",
    kapasitas_data: kapasitasData,
  });
  if (profileError) {
    // Jangan tinggalkan akun auth "yatim" (bisa login tapi tanpa profil,
    // ke-block gara-gara requireAdmin di semua action lain butuh row di
    // public.users) - bersihkan lagi kalau insert profil gagal.
    await service.auth.admin.deleteUser(authData.user.id);
    return { success: false, error: profileError.message };
  }

  revalidatePath("/admin/agents");
  return { success: true };
}

export interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
  /** true = admin monitoring - tidak bisa akses Import Data / tombol Export. */
  isRestricted: boolean;
}

export async function createAdmin(input: CreateAdminInput): Promise<AgentActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { success: false, error: "Nama wajib diisi." };
  if (!email) return { success: false, error: "Email wajib diisi." };
  if (input.password.length < 6) {
    return { success: false, error: "Password minimal 6 karakter." };
  }

  const service = createServiceRoleClient();
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (authError) return { success: false, error: authError.message };

  const { error: adminProfileError } = await service.from("users").insert({
    id: authData.user.id,
    name,
    email,
    role: "admin",
    is_active: true,
    is_restricted_admin: input.isRestricted,
  });
  if (adminProfileError) {
    await service.auth.admin.deleteUser(authData.user.id);
    return { success: false, error: adminProfileError.message };
  }

  revalidatePath("/admin/agents");
  return { success: true };
}
