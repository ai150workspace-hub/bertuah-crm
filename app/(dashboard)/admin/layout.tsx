import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CURRENT_ADMIN } from "@/lib/mock-data";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <DashboardShell role="admin" roleLabel="Admin / Operations" user={CURRENT_ADMIN}>
      {children}
    </DashboardShell>
  );
}
