"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

export interface LeasingPartnerActionResult {
  success: boolean;
  error?: string;
}

export async function createLeasingPartner(name: string): Promise<LeasingPartnerActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };
  if (!name.trim()) return { success: false, error: "Nama wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("leasing_partners").insert({ name: name.trim() });
  if (error) {
    if (error.code === "23505") return { success: false, error: "Nama leasing partner ini sudah ada." };
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/leasing");
  return { success: true };
}

export async function updateLeasingPartner(id: string, name: string): Promise<LeasingPartnerActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };
  if (!name.trim()) return { success: false, error: "Nama wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.from("leasing_partners").update({ name: name.trim() }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { success: false, error: "Nama leasing partner ini sudah ada." };
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/leasing");
  return { success: true };
}

export async function toggleLeasingPartnerActive(
  id: string,
  isActive: boolean
): Promise<LeasingPartnerActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leasing_partners")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/leasing");
  return { success: true };
}
