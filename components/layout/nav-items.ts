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
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Not yet built in this phase — rendered disabled with a "Segera" badge. */
  comingSoon?: boolean;
}

export const AGENT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/agent/dashboard", icon: LayoutDashboard },
  { label: "Antrean Saya", href: "/agent/queue", icon: Users },
  { label: "Aplikasi Saya", href: "/agent/applications", icon: FileStack },
  { label: "Performa Saya", href: "/agent/performance", icon: BarChart3 },
];

export const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Contacts", href: "/admin/contacts", icon: Users },
  { label: "Agents", href: "/admin/agents", icon: UserCog },
  {
    label: "Leasing Partners",
    href: "/admin/leasing",
    icon: Building2,
    comingSoon: true,
  },
  { label: "Applications", href: "/admin/applications", icon: FileStack },
  {
    label: "Import Data",
    href: "/admin/import",
    icon: UploadCloud,
  },
  { label: "Insentif", href: "/admin/incentives", icon: Wallet },
  {
    label: "Audit Log",
    href: "/admin/audit-log",
    icon: ScrollText,
    comingSoon: true,
  },
];
