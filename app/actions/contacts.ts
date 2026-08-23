"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export interface ContactsActionResult {
  success: boolean;
  error?: string;
}

/** Session client hanya dipakai untuk verifikasi siapa yang memanggil. */
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

export async function assignContacts(
  contactIds: string[],
  agentId: string
): Promise<ContactsActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };
  if (contactIds.length === 0) return { success: false, error: "Tidak ada kontak dipilih." };

  // Bulk admin op - pakai service role, bukan client sesi (lihat catatan di
  // components/admin/contacts/*). Verifikasi admin sudah lewat di atas.
  const service = createServiceRoleClient();

  const { data: agent } = await service
    .from("users")
    .select("name, kapasitas_data")
    .eq("id", agentId)
    .eq("role", "agent")
    .maybeSingle();
  if (!agent) return { success: false, error: "Agent tujuan tidak ditemukan." };

  const { count: existingUncalled } = await service
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", agentId)
    .eq("status_call", "Uncalled");

  const projected = (existingUncalled ?? 0) + contactIds.length;
  if (projected > agent.kapasitas_data) {
    const sisa = Math.max(0, agent.kapasitas_data - (existingUncalled ?? 0));
    return {
      success: false,
      error: `Agent ${agent.name} hanya punya ${sisa} slot tersisa, kamu memilih ${contactIds.length} kontak.`,
    };
  }

  const { error } = await service
    .from("contacts")
    .update({ assigned_to: agentId, assigned_at: new Date().toISOString() })
    .in("id", contactIds);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/contacts");
  revalidatePath("/agent/dashboard");
  revalidatePath("/agent/queue");
  return { success: true };
}

export async function releaseContactsToPool(
  contactIds: string[]
): Promise<ContactsActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };
  if (contactIds.length === 0) return { success: false, error: "Tidak ada kontak dipilih." };

  const service = createServiceRoleClient();
  // status_call SENGAJA tidak disentuh - kontak Warm tetap Warm di pool.
  const { error } = await service
    .from("contacts")
    .update({ assigned_to: null, assigned_at: null })
    .in("id", contactIds);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/contacts");
  revalidatePath("/agent/dashboard");
  revalidatePath("/agent/queue");
  return { success: true };
}

export async function removeDnc(noHp: string): Promise<ContactsActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("do_not_contact").delete().eq("no_hp", noHp);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/contacts");
  return { success: true };
}
