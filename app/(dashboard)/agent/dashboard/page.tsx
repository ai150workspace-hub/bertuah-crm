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
import { QueueTable } from "@/components/agent/QueueTable";
import { AGENT_KPI } from "@/lib/mock-data";
import { formatCompactRupiah, formatPercent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_SELECT, mapDbContact, getActiveSlots, type ContactRow } from "@/lib/contacts";
import { getCapabilities } from "@/lib/telephony/provider";

export default async function AgentDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("name").eq("id", user.id).maybeSingle()
    : { data: null };
  const firstName = profile?.name ? profile.name.split(" ")[0] : "";

  const { data: contactRows } = user
    ? await supabase
        .from("contacts")
        .select(CONTACT_SELECT)
        .eq("assigned_to", user.id)
        .order("created_at", { ascending: true })
    : { data: null };

  const contacts = ((contactRows ?? []) as ContactRow[]).map(mapDbContact);
  const hotLeads = contacts.filter((c) => c.statusCall === "Hot Lead").length;
  const capabilities = await getCapabilities();
  const activeSlots = user ? await getActiveSlots(supabase, user.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Selamat bekerja{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Ringkasan aktivitas kamu hari ini di Bertuah CRM.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="My Leads" value={String(contacts.length)} icon={Users} />
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
        <KpiCard label="Hot Leads" value={String(hotLeads)} icon={Flame} tone="hot" />
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

      <QueueTable contacts={contacts} capabilities={capabilities} activeSlots={activeSlots} compact />
    </div>
  );
}
