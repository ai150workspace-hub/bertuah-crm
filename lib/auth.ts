import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export interface CurrentUserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  agentStatus: "active" | "pause" | "inactive" | null;
}

/**
 * Satu-satunya tempat yang memanggil auth.getUser() + query profil users di
 * dalam React Server Components. Dibungkus React.cache() supaya dalam satu
 * request yang sama (mis. layout.tsx lalu page.tsx), panggilan kedua dst.
 * tidak query ulang - hasil pertama dipakai lagi. Middleware (proxy.ts)
 * tetap jalan terpisah sebagai lapisan keamanan resmi, bukan diganti ini.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUserProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role, is_active, agent_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    isActive: profile.is_active,
    agentStatus: (profile.agent_status ?? null) as CurrentUserProfile["agentStatus"],
  };
});
