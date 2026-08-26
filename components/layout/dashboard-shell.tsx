import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import type { AppUser } from "@/types";

export function DashboardShell({
  role,
  roleLabel,
  user,
  children,
  badgeCounts,
}: {
  role: "agent" | "admin";
  roleLabel: string;
  user: AppUser;
  children: React.ReactNode;
  badgeCounts?: Partial<Record<string, number>>;
}) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar role={role} roleLabel={roleLabel} badgeCounts={badgeCounts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar role={role} user={user} badgeCounts={badgeCounts} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
