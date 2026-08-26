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
import { formatRupiah, formatPercent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  CONTACT_SELECT,
  mapDbContact,
  getActiveSlots,
  markPreviousCallFlags,
  type ContactRow,
} from "@/lib/contacts";
import { getCapabilities } from "@/lib/telephony/provider";
import { adalahRpc } from "@/lib/call-outcome/derive";
import type { KodeHasil } from "@/lib/call-outcome/catalog";
import { calculateAgentIncentive, type DisbursedDeal } from "@/lib/incentive-calculator";
import { todayWib, startOfMonthWib, wibDayStartIso, wibDayEndIso } from "@/lib/wib-date";
import { getActiveScriptContent } from "@/lib/scripts";
import { getWaTemplate } from "@/lib/wa-templates";

const DASHBOARD_PREVIEW_SIZE = 5;

export default async function AgentDashboardPage() {
  const profile = await getCurrentUser();
  const supabase = await createClient();
  const firstName = profile?.name ? profile.name.split(" ")[0] : "";

  const today = todayWib();
  const todayStartIso = wibDayStartIso(today);
  const todayEndIso = wibDayEndIso(today);
  const monthStart = startOfMonthWib(today);
  const [monthStartYear, monthStartMonth] = monthStart.split("-").map(Number);
  const nextMonth = monthStartMonth === 12 ? 1 : monthStartMonth! + 1;
  const nextYear = monthStartMonth === 12 ? monthStartYear! + 1 : monthStartYear;
  const monthEndExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  // Dashboard cuma butuh cuplikan kecil + angka ringkasan, BUKAN seluruh
  // antrean - itu tugas /agent/queue. 7 query independen (tidak saling
  // butuh hasil satu sama lain) jalan bareng, bukan berurutan.
  const [
    { count: totalLeads },
    { count: hotLeadsCount },
    { data: previewRows },
    { data: callLogsToday },
    { count: readyToSurveyCount },
    { data: disbursedThisMonth },
    { count: activeAgentCount },
  ] = profile
    ? await Promise.all([
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("assigned_to", profile.id),
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("assigned_to", profile.id)
          .eq("status_call", "Hot Lead"),
        supabase
          .from("contacts")
          .select(CONTACT_SELECT)
          .eq("assigned_to", profile.id)
          .order("created_at", { ascending: true })
          .limit(DASHBOARD_PREVIEW_SIZE),
        // Today Calls + Contact Rate - 1 query, dipecah jadi 2 angka di JS.
        supabase
          .from("call_logs")
          .select("hasil")
          .eq("agent_id", profile.id)
          .gte("timestamp", todayStartIso)
          .lte("timestamp", todayEndIso),
        supabase
          .from("applications")
          .select("*", { count: "exact", head: true })
          .eq("agent_id", profile.id)
          .eq("status_aplikasi", "Survey"),
        // Pencairan Bulan Ini + Estimasi Insentif - 1 query, dipakai dua-duanya.
        supabase
          .from("applications")
          .select("nominal_pencairan, tenor_bulan")
          .eq("agent_id", profile.id)
          .eq("status_aplikasi", "Disbursed")
          .gte("date_disbursed", monthStart)
          .lt("date_disbursed", monthEndExclusive),
        supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("role", "agent")
          .eq("is_active", true),
      ])
    : [
        { count: 0 },
        { count: 0 },
        { data: null },
        { data: null },
        { count: 0 },
        { data: null },
        { count: 0 },
      ];

  const previewContacts = ((previewRows ?? []) as ContactRow[]).map(mapDbContact);
  const hotLeads = hotLeadsCount ?? 0;

  const callsToday = callLogsToday ?? [];
  const totalCallsToday = callsToday.length;
  // "Connected" dihitung via adalahRpc(hasil), bukan level_1='CONNECTED' mentah -
  // level_1 lama menghitung busy tone/mailbox sebagai "tersambung". Disamakan
  // dengan definisi yang sudah dipakai di /admin/dashboard dan /admin/agents.
  const connectedToday = callsToday.filter(
    (l) => l.hasil && adalahRpc(l.hasil as KodeHasil)
  ).length;
  const contactRateLabel =
    totalCallsToday > 0 ? formatPercent((connectedToday / totalCallsToday) * 100) : "—";

  // Estimasi Insentif - pakai calculateAgentIncentive() yang sudah ada
  // (lib/incentive-calculator.ts), sama persis seperti dipakai /admin/incentives.
  // Deal individual bulan berjalan dipakai juga untuk Pencairan Bulan Ini,
  // supaya tidak query dua kali ke tabel yang sama.
  const deals: DisbursedDeal[] = (disbursedThisMonth ?? []).map((d) => ({
    nominalPencairan: d.nominal_pencairan ?? 0,
    tenorBulan: d.tenor_bulan ?? 12,
  }));
  const monthlyDisbursement = deals.reduce((sum, d) => sum + d.nominalPencairan, 0);
  const incentive =
    profile && profile.name
      ? calculateAgentIncentive(
          { agentId: profile.id, agentName: profile.name, deals },
          activeAgentCount ?? 1
        )
      : null;

  // 5 operasi independen (tidak saling butuh hasil satu sama lain) - jalan
  // bareng, bukan berurutan.
  const [contacts, capabilities, activeSlots, scripts, initialFollowupTemplate] = await Promise.all([
    profile ? markPreviousCallFlags(previewContacts, profile.id) : Promise.resolve(previewContacts),
    getCapabilities(),
    profile ? getActiveSlots(supabase, profile.id) : Promise.resolve(null),
    getActiveScriptContent(),
    getWaTemplate("initial_followup"),
  ]);

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
        <KpiCard label="My Leads" value={String(totalLeads ?? 0)} icon={Users} />
        <KpiCard label="Today Calls" value={String(totalCallsToday)} icon={PhoneCall} />
        <KpiCard label="Contact Rate" value={contactRateLabel} icon={TrendingUp} />
        <KpiCard label="Hot Leads" value={String(hotLeads)} icon={Flame} tone="hot" />
        <KpiCard
          label="Ready to Survey"
          value={String(readyToSurveyCount ?? 0)}
          icon={CalendarCheck}
        />
        <KpiCard
          label="Pencairan Bulan Ini"
          value={formatRupiah(monthlyDisbursement)}
          icon={Banknote}
          tone="success"
        />
        <KpiCard
          label="Estimasi Insentif"
          value={formatRupiah(incentive?.takeHome ?? 0)}
          icon={Wallet}
          tone="success"
        />
      </div>

      <QueueTable
        contacts={contacts}
        capabilities={capabilities}
        activeSlots={activeSlots}
        agentStatus={profile?.agentStatus ?? undefined}
        totalCount={totalLeads ?? 0}
        scripts={scripts}
        agentId={profile?.id}
        agentCreatedAt={profile?.createdAt}
        initialFollowupTemplate={initialFollowupTemplate?.templateText ?? null}
        compact
      />
    </div>
  );
}
