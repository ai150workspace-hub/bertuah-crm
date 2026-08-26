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
  createdAt: string;
}

/**
 * Satu-satunya tempat yang membaca sesi + query profil users di dalam React
 * Server Components. Dibungkus React.cache() supaya dalam satu request yang
 * sama (mis. layout.tsx lalu page.tsx), panggilan kedua dst. tidak query
 * ulang - hasil pertama dipakai lagi.
 *
 * Pakai getSession() (baca cookie lokal, tanpa roundtrip jaringan), BUKAN
 * getUser() (yang selalu hit server Supabase Auth) - karena proxy.ts sudah
 * memanggil getUser() lebih dulu untuk request yang sama persis dan redirect
 * ke /login kalau sesi tidak valid. Middleware DIJAMIN Next.js selalu jalan
 * duluan untuk semua path yang match, jadi begitu kode ini jalan, sesi sudah
 * pasti tervalidasi - getSession() di sini aman, bukan trust-blindly.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUserProfile | null> => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role, is_active, agent_status, created_at")
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
    createdAt: profile.created_at,
  };
});
