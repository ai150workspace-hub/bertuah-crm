"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";
import { AGENT_NAV, ADMIN_NAV } from "./nav-items";

export function Sidebar({
  role,
  roleLabel,
  badgeCounts,
}: {
  role: "agent" | "admin";
  roleLabel: string;
  /** Angka kecil per nav item, keyed oleh NavItem.badgeKey (lihat nav-items.ts). */
  badgeCounts?: Partial<Record<string, number>>;
}) {
  const pathname = usePathname();
  const items = role === "agent" ? AGENT_NAV : ADMIN_NAV;

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:shrink-0 bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-2 px-5 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <ShieldCheck className="h-4.5 w-4.5" />
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-sm text-sidebar-foreground">
            Bertuah CRM
          </div>
          <div className="text-[11px] text-sidebar-foreground/60">
            {roleLabel}
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {items.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          if (item.comingSoon) {
            return (
              <div
                key={item.href}
                className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40 cursor-not-allowed"
                title="Belum tersedia di fase ini"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                <span className="text-[10px] rounded-full border border-sidebar-border px-1.5 py-0.5">
                  Segera
                </span>
              </div>
            );
          }

          const badgeCount = item.badgeKey ? badgeCounts?.[item.badgeKey] : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {!!badgeCount && (
                <span
                  className={cn(
                    "flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                    isActive
                      ? "bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground"
                      : "bg-hot text-white"
                  )}
                >
                  {badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-sidebar-border text-[11px] text-sidebar-foreground/50">
        Multiguna Jaminan BPKB
        <br />
        Mobil &amp; Motor · Pekanbaru
      </div>
    </aside>
  );
}
