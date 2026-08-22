import type { SupabaseClient } from "@supabase/supabase-js";
import { adalahRpc } from "@/lib/call-outcome/derive";
import { wibDayStartIso, wibDayEndIso } from "@/lib/wib-date";

export interface DateRange {
  /** YYYY-MM-DD, kalender WIB, inklusif. */
  from: string;
  to: string;
}

export interface AdminKpi {
  totalCalls: number;
  contactRate: number;
  interest: number;
  hotLeads: number;
  readyToSurvey: number;
  totalApplications: number;
  approved: number;
  disbursed: number;
  totalRevenue: number;
}

export interface FunnelStage {
  label: string;
  value: number;
}

export interface AgentPerformanceRow {
  agentId: string;
  agentName: string;
  totalDial: number;
  disbursed: number;
}

export interface AdminDashboardData {
  databaseTotal: number;
  kpi: AdminKpi;
  funnel: FunnelStage[];
  agents: AgentPerformanceRow[];
}

interface CallLogRow {
  agent_id: string;
  hasil: string | null;
  timestamp: string;
}

interface ApplicationRow {
  id: string;
  agent_id: string;
  status_aplikasi: string;
  nominal_pencairan: number | null;
  nominal_komisi_pku: number | null;
  created_at: string;
  date_submitted: string | null;
  date_survey: string | null;
  date_approved: string | null;
  date_disbursed: string | null;
}

function inWibRange(iso: string | null, startIso: string, endIso: string): boolean {
  if (!iso) return false;
  return iso >= startIso && iso <= endIso;
}

/** date_survey/date_approved/date_disbursed adalah kolom `date` (tanpa jam). */
function dateInRange(dateStr: string | null, range: DateRange): boolean {
  if (!dateStr) return false;
  return dateStr >= range.from && dateStr <= range.to;
}

export async function getAdminDashboardData(
  supabase: SupabaseClient,
  range: DateRange
): Promise<AdminDashboardData> {
  const startIso = wibDayStartIso(range.from);
  const endIso = wibDayEndIso(range.to);

  const [{ count: databaseTotal }, { data: callLogData }, { data: appData }, { data: agentData }] =
    await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase
        .from("call_logs")
        .select("agent_id, hasil, timestamp")
        .gte("timestamp", startIso)
        .lte("timestamp", endIso),
      supabase
        .from("applications")
        .select(
          "id, agent_id, status_aplikasi, nominal_pencairan, nominal_komisi_pku, created_at, date_submitted, date_survey, date_approved, date_disbursed"
        ),
      supabase.from("users").select("id, name").eq("role", "agent").eq("is_active", true),
    ]);

  const logs = (callLogData ?? []) as CallLogRow[];
  const apps = (appData ?? []) as ApplicationRow[];
  const agentUsers = (agentData ?? []) as { id: string; name: string }[];

  const totalCalls = logs.length;
  const rpcCount = logs.filter((l) => l.hasil && adalahRpc(l.hasil as Parameters<typeof adalahRpc>[0])).length;
  const contactRate = totalCalls ? (rpcCount / totalCalls) * 100 : 0;
  const interest = logs.filter((l) => l.hasil === "MINAT").length;
  const hotLeads = logs.filter((l) => l.hasil === "MINAT" || l.hasil === "JANJI_TEMU").length;

  // "Ready to Survey" bukan status_aplikasi formal di skema ini (lihat
  // FinMatch_PKU_PRD.md) - didekati dari application yang masih Draft,
  // dibuat dalam periode terpilih.
  const readyToSurvey = apps.filter(
    (a) => a.status_aplikasi === "Draft" && inWibRange(a.created_at, startIso, endIso)
  ).length;
  const totalApplications = apps.filter((a) => inWibRange(a.created_at, startIso, endIso)).length;
  const sentToLeasing = apps.filter(
    (a) => a.status_aplikasi === "Sent to Leasing" && inWibRange(a.date_submitted, startIso, endIso)
  ).length;
  const survey = apps.filter(
    (a) => a.status_aplikasi === "Survey" && dateInRange(a.date_survey, range)
  ).length;
  const approvedApps = apps.filter(
    (a) => a.status_aplikasi === "Approved" && dateInRange(a.date_approved, range)
  );
  const disbursedApps = apps.filter(
    (a) => a.status_aplikasi === "Disbursed" && dateInRange(a.date_disbursed, range)
  );
  const totalRevenue = disbursedApps.reduce((sum, a) => sum + (a.nominal_komisi_pku ?? 0), 0);

  const kpi: AdminKpi = {
    totalCalls,
    contactRate,
    interest,
    hotLeads,
    readyToSurvey,
    totalApplications,
    approved: approvedApps.length,
    disbursed: disbursedApps.length,
    totalRevenue,
  };

  const funnel: FunnelStage[] = [
    { label: "Called", value: totalCalls },
    { label: "Connected", value: rpcCount },
    { label: "Interested", value: interest },
    { label: "Ready to Survey", value: readyToSurvey },
    { label: "Sent to Leasing", value: sentToLeasing },
    { label: "Survey", value: survey },
    { label: "Approved", value: approvedApps.length },
    { label: "Disbursed", value: disbursedApps.length },
  ];

  const dialByAgent = new Map<string, number>();
  for (const log of logs) {
    dialByAgent.set(log.agent_id, (dialByAgent.get(log.agent_id) ?? 0) + 1);
  }
  const disbursedByAgent = new Map<string, number>();
  for (const app of disbursedApps) {
    disbursedByAgent.set(
      app.agent_id,
      (disbursedByAgent.get(app.agent_id) ?? 0) + (app.nominal_pencairan ?? 0)
    );
  }

  const agents: AgentPerformanceRow[] = agentUsers.map((u) => ({
    agentId: u.id,
    agentName: u.name,
    totalDial: dialByAgent.get(u.id) ?? 0,
    disbursed: disbursedByAgent.get(u.id) ?? 0,
  }));

  return { databaseTotal: databaseTotal ?? 0, kpi, funnel, agents };
}
