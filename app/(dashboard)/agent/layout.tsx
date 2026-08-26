import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getReengagementCount } from "@/lib/reengagement";
import type { AppUser } from "@/types";

// Badge sidebar "Follow-up Ulang" dibaca di layout, yang jalan di SETIAP
// navigasi agent - kalau query langsung, itu nambah 1 query lagi ke jalur
// kritis semua halaman (persis pola yang dihilangkan susah payah sepanjang
// audit performa sesi ini). Beda dengan angka kapasitas yang wajib akurat
// real-time, badge notifikasi ini aman sedikit basi - cache 60 detik per
// agent supaya navigasi tetap cepat, dan tetap ter-refresh reguler tanpa
// perlu invalidation manual di mana-mana.
//
// Pakai service-role client di sini (BUKAN createClient() session) -
// Next.js melarang cookies() (yang dipakai createClient() untuk baca
// sesi) di dalam unstable_cache, karena hasilnya bisa ke-share lintas
// user/request. Aman dipakai di sini karena query-nya sudah difilter
// eksplisit ke agentId yang didapat dari sesi ASLI (getCurrentUser())
// di luar cache - bukan celah bypass RLS untuk data user lain.
const getCachedReengagementCount = unstable_cache(
  async (agentId: string) => {
    const supabase = createServiceRoleClient();
    return getReengagementCount(supabase, agentId);
  },
  ["agent-reengagement-badge-count"],
  { revalidate: 60 }
);

export default async function AgentLayout({ children }: LayoutProps<"/agent">) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const appUser: AppUser = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    active: profile.isActive,
  };

  const reengagementCount = await getCachedReengagementCount(profile.id);

  return (
    <DashboardShell
      role="agent"
      roleLabel="Agent Workspace"
      user={appUser}
      badgeCounts={{ reengagement: reengagementCount }}
    >
      {children}
    </DashboardShell>
  );
}
