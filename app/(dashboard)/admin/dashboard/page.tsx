import {
  PhoneCall,
  TrendingUp,
  Sparkles,
  Flame,
  CalendarCheck,
  FileStack,
  ClipboardCheck,
  CircleCheck,
  Banknote,
} from "lucide-react";
import dynamic from "next/dynamic";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentPerformanceTable } from "@/components/admin/agent-performance-table";
import { DateRangeFilter } from "@/components/admin/date-range-filter";
import { IncentiveCalculator } from "@/components/admin/IncentiveCalculator";
import { formatCompactRupiah, formatPercent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdminDashboardData } from "@/lib/admin-metrics";
import { todayWib, startOfMonthWib } from "@/lib/wib-date";

// recharts cukup besar - dipisah jadi chunk sendiri, bukan ikut bundle
// awal halaman dashboard.
const FunnelChart = dynamic(
  () => import("@/components/admin/funnel-chart").then((m) => m.FunnelChart),
  { loading: () => <Skeleton className="h-72 rounded-lg" /> }
);

export default async function AdminDashboardPage({
  searchParams,
}: PageProps<"/admin/dashboard">) {
  const params = await searchParams;
  const today = todayWib();
  const fromParam = params.from;
  const toParam = params.to;
  const from = typeof fromParam === "string" ? fromParam : startOfMonthWib(today);
  const to = typeof toParam === "string" ? toParam : today;
  const profile = await getCurrentUser();

  const [todayYear, todayMonth] = today.split("-").map(Number);
  const incMonthParam = params.incMonth;
  const incYearParam = params.incYear;
  const incMonth =
    typeof incMonthParam === "string" && Number(incMonthParam) >= 1 && Number(incMonthParam) <= 12
      ? Number(incMonthParam)
      : todayMonth!;
  const incYear =
    typeof incYearParam === "string" && Number.isInteger(Number(incYearParam))
      ? Number(incYearParam)
      : todayYear!;

  const supabase = await createClient();
  const { databaseTotal, kpi, funnel, agents } = await getAdminDashboardData(supabase, {
    from,
    to,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Command Center — Bertuah CRM
        </h1>
        <p className="text-sm text-muted-foreground">
          Ringkasan operasional tim telemarketing Pekanbaru.
        </p>
      </div>

      <DateRangeFilter from={from} to={to} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Panggilan" value={String(kpi.totalCalls)} icon={PhoneCall} />
        <KpiCard
          label="Contact Rate"
          value={formatPercent(kpi.contactRate)}
          icon={TrendingUp}
        />
        <KpiCard label="Interest" value={String(kpi.interest)} icon={Sparkles} />
        <KpiCard label="Hot Leads" value={String(kpi.hotLeads)} icon={Flame} tone="hot" />
        <KpiCard
          label="Ready to Survey"
          value={String(kpi.readyToSurvey)}
          icon={CalendarCheck}
        />
        <KpiCard
          label="Total Aplikasi"
          value={String(kpi.totalApplications)}
          icon={FileStack}
        />
        <KpiCard label="Approved" value={String(kpi.approved)} icon={ClipboardCheck} />
        <KpiCard
          label="Disbursed"
          value={String(kpi.disbursed)}
          icon={CircleCheck}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FunnelChart stages={funnel} databaseTotal={databaseTotal} />
        </div>
        <KpiCard
          label="Total Revenue Agregator"
          value={formatCompactRupiah(kpi.totalRevenue)}
          icon={Banknote}
          hint="Dihitung hanya dari application berstatus Disbursed"
          tone="success"
        />
      </div>

      <AgentPerformanceTable agents={agents} />

      <IncentiveCalculator month={incMonth} year={incYear} isRestrictedAdmin={profile?.isRestrictedAdmin} />
    </div>
  );
}
