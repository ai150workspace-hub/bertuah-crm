import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  FileStack,
  BarChart3,
  Building2,
  UserCog,
  UploadCloud,
  Wallet,
  ScrollText,
  RotateCcw,
  BookOpen,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Not yet built in this phase — rendered disabled with a "Segera" badge. */
  comingSoon?: boolean;
  /** Kunci ke badgeCounts (lihat DashboardShell) - angka kecil di sisi kanan item, disembunyikan kalau 0/tidak ada. */
  badgeKey?: string;
}

export const AGENT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/agent/dashboard", icon: LayoutDashboard },
  { label: "Antrean Saya", href: "/agent/queue", icon: Users },
  { label: "Aplikasi Saya", href: "/agent/applications", icon: FileStack },
  { label: "Performa Saya", href: "/agent/performance", icon: BarChart3 },
  {
    label: "Follow-up Ulang",
    href: "/agent/reengagement",
    icon: RotateCcw,
    badgeKey: "reengagement",
  },
];

export const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Contacts", href: "/admin/contacts", icon: Users },
  { label: "Agents", href: "/admin/agents", icon: UserCog },
  { label: "Leasing Partners", href: "/admin/leasing", icon: Building2 },
  { label: "Applications", href: "/admin/applications", icon: FileStack },
  {
    label: "Import Data",
    href: "/admin/import",
    icon: UploadCloud,
  },
  { label: "Insentif", href: "/admin/incentives", icon: Wallet },
  { label: "Kelola Script", href: "/admin/scripts", icon: BookOpen },
  {
    label: "Audit Log",
    href: "/admin/audit-log",
    icon: ScrollText,
    comingSoon: true,
  },
];
