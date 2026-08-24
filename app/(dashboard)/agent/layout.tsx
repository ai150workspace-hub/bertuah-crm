import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";
import type { AppUser } from "@/types";

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

  return (
    <DashboardShell role="agent" roleLabel="Agent Workspace" user={appUser}>
      {children}
    </DashboardShell>
  );
}
