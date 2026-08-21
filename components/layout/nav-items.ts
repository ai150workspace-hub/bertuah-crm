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
  { label: "Antrean Saya", href: "/agent/leads", icon: Users, comingSoon: true },
  {
    label: "Aplikasi Saya",
    href: "/agent/applications",
    icon: FileStack,
    comingSoon: true,
  },
  {
    label: "Performa Saya",
    href: "/agent/performance",
    icon: BarChart3,
    comingSoon: true,
  },
];

export const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Contacts", href: "/admin/contacts", icon: Users, comingSoon: true },
  { label: "Agents", href: "/admin/agents", icon: UserCog, comingSoon: true },
  {
    label: "Leasing Partners",
    href: "/admin/leasing",
    icon: Building2,
    comingSoon: true,
  },
  {
    label: "Applications",
    href: "/admin/applications",
    icon: FileStack,
    comingSoon: true,
  },
  {
    label: "Import Data",
    href: "/admin/import",
    icon: UploadCloud,
    comingSoon: true,
  },
  { label: "Insentif", href: "/admin/incentives", icon: Wallet, comingSoon: true },
  {
    label: "Audit Log",
    href: "/admin/audit-log",
    icon: ScrollText,
    comingSoon: true,
  },
];
