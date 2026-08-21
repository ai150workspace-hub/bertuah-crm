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
import { KpiCard } from "@/components/dashboard/kpi-card";
import { FunnelChart } from "@/components/admin/funnel-chart";
import { AgentPerformanceTable } from "@/components/admin/agent-performance-table";
import { ADMIN_KPI } from "@/lib/mock-data";
import { formatCompactRupiah, formatPercent } from "@/lib/format";

export default function AdminDashboardPage() {
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Panggilan" value={String(ADMIN_KPI.totalCalls)} icon={PhoneCall} />
        <KpiCard
          label="Contact Rate"
          value={formatPercent(ADMIN_KPI.contactRate)}
          icon={TrendingUp}
        />
        <KpiCard label="Interest" value={String(ADMIN_KPI.interest)} icon={Sparkles} />
        <KpiCard label="Hot Leads" value={String(ADMIN_KPI.hotLeads)} icon={Flame} tone="hot" />
        <KpiCard
          label="Ready to Survey"
          value={String(ADMIN_KPI.readyToSurvey)}
          icon={CalendarCheck}
        />
        <KpiCard
          label="Total Aplikasi"
          value={String(ADMIN_KPI.totalApplications)}
          icon={FileStack}
        />
        <KpiCard label="Approved" value={String(ADMIN_KPI.approved)} icon={ClipboardCheck} />
        <KpiCard
          label="Disbursed"
          value={String(ADMIN_KPI.disbursed)}
          icon={CircleCheck}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FunnelChart />
        </div>
        <KpiCard
          label="Total Revenue Agregator"
          value={formatCompactRupiah(ADMIN_KPI.totalRevenue)}
          icon={Banknote}
          hint="Dihitung hanya dari application berstatus Disbursed"
          tone="success"
        />
      </div>

      <AgentPerformanceTable />
    </div>
  );
}
