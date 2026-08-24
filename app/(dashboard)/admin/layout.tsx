import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";
import type { AppUser } from "@/types";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/agent/dashboard");

  const appUser: AppUser = {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    active: profile.isActive,
  };

  return (
    <DashboardShell role="admin" roleLabel="Admin / Operations" user={appUser}>
      {children}
    </DashboardShell>
  );
}
