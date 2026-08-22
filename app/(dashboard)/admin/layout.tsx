import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/types";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/agent/dashboard");

  const appUser: AppUser = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    active: profile.is_active,
  };

  return (
    <DashboardShell role="admin" roleLabel="Admin / Operations" user={appUser}>
      {children}
    </DashboardShell>
  );
}
