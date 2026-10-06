"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface PengambilanDataResult {
  success: boolean;
  error?: string;
}

/**
 * Buka/tutup tahap Uncalled pada klaim "Ambil Data Baru" agen
 * (system_config.uncalled_claim_enabled, dibaca assign_contacts_to_agent -
 * migrasi 0027). Tahap Warm dan In Progress tidak terpengaruh.
 */
export async function setUncalledClaimEnabled(enabled: boolean): Promise<PengambilanDataResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

  // Lapis keamanan sebenarnya untuk admin monitoring - tombolnya sudah
  // disembunyikan di UI, tapi itu bisa dilewati kalau action ini dipanggil
  // langsung. RLS system_config cuma membedakan admin vs bukan (admin
  // monitoring juga role='admin'), jadi is_restricted_admin dicek eksplisit
  // di sini, sama seperti commitImport di app/actions/import.ts.
  const { data: profile } = await supabase
    .from("users")
    .select("role, is_restricted_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return { success: false, error: "Hanya admin yang boleh mengubah ini." };
  }
  if (profile.is_restricted_admin) {
    return { success: false, error: "Akun Anda hanya untuk monitoring, tidak bisa mengubah pengaturan." };
  }

  const { error } = await supabase
    .from("system_config")
    .upsert(
      {
        key: "uncalled_claim_enabled",
        value: enabled ? "true" : "false",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/dashboard");
  return { success: true };
}
