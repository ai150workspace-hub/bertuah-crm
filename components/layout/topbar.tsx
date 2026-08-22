"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AGENT_NAV, ADMIN_NAV } from "./nav-items";
import { signOut } from "@/app/actions/auth";
import type { AppUser } from "@/types";

export function TopBar({
  role,
  user,
}: {
  role: "agent" | "admin";
  user: AppUser;
}) {
  const pathname = usePathname();
  const items = role === "agent" ? AGENT_NAV : ADMIN_NAV;
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
            <SheetTitle className="sr-only">Navigasi</SheetTitle>
            <div className="flex h-16 items-center gap-2 px-5 border-b border-sidebar-border">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ShieldCheck className="h-4.5 w-4.5" />
              </div>
              <span className="font-semibold text-sm">Bertuah CRM</span>
            </div>
            <nav className="space-y-0.5 p-3">
              {items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                if (item.comingSoon) {
                  return (
                    <div
                      key={item.href}
                      className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/40"
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
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
        <span className="md:hidden font-semibold text-sm">Bertuah CRM</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right leading-tight">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-xs text-muted-foreground capitalize">
            {user.role}
          </div>
        </div>
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <form action={signOut}>
          <Button variant="ghost" size="icon" title="Keluar" type="submit">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
