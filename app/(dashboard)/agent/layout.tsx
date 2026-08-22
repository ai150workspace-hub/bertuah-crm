import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/types";

export default async function AgentLayout({ children }: LayoutProps<"/agent">) {
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

  const appUser: AppUser = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    active: profile.is_active,
  };

  return (
    <DashboardShell role="agent" roleLabel="Agent Workspace" user={appUser}>
      {children}
    </DashboardShell>
  );
}
