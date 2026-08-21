import {
  Users,
  PhoneCall,
  TrendingUp,
  Flame,
  CalendarCheck,
  Wallet,
  Banknote,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { LeadQueueTable } from "@/components/agent/lead-queue-table";
import { AGENT_KPI, MOCK_CONTACTS } from "@/lib/mock-data";
import { formatCompactRupiah, formatPercent } from "@/lib/format";

export default function AgentDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Selamat bekerja, Rina 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Ringkasan aktivitas kamu hari ini di Bertuah CRM.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="My Leads" value={String(AGENT_KPI.myLeads)} icon={Users} />
        <KpiCard
          label="Today Calls"
          value={String(AGENT_KPI.todayCalls)}
          icon={PhoneCall}
        />
        <KpiCard
          label="Contact Rate"
          value={formatPercent(AGENT_KPI.contactRate)}
          icon={TrendingUp}
        />
        <KpiCard
          label="Hot Leads"
          value={String(AGENT_KPI.hotLeads)}
          icon={Flame}
          tone="hot"
        />
        <KpiCard
          label="Ready to Survey"
          value={String(AGENT_KPI.readyToSurvey)}
          icon={CalendarCheck}
        />
        <KpiCard
          label="Pencairan Bulan Ini"
          value={formatCompactRupiah(AGENT_KPI.monthlyDisbursement)}
          icon={Banknote}
          tone="success"
        />
        <KpiCard
          label="Estimasi Insentif"
          value={formatCompactRupiah(AGENT_KPI.estimatedIncentive)}
          icon={Wallet}
          tone="success"
        />
      </div>

      <LeadQueueTable contacts={MOCK_CONTACTS} />
    </div>
  );
}
