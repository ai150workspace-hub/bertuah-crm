import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CURRENT_AGENT } from "@/lib/mock-data";

export default function AgentLayout({ children }: LayoutProps<"/agent">) {
  return (
    <DashboardShell role="agent" roleLabel="Agent Workspace" user={CURRENT_AGENT}>
      {children}
    </DashboardShell>
  );
}
