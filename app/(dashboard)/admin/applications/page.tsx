import { FileStack, Clock, CircleCheck, Banknote } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DateRangeFilter } from "@/components/admin/date-range-filter";
import { ApplicationsFilterBar } from "@/components/admin/applications-filter-bar";
import { ApplicationsTable, type AdminApplicationRow } from "@/components/admin/applications-table";
import { createClient } from "@/lib/supabase/server";
import { formatCompactRupiah } from "@/lib/format";
import { wibDayStartIso, wibDayEndIso, todayWib, startOfMonthWib } from "@/lib/wib-date";
import type { ApplicationStatus } from "@/types";

const ALL_STATUSES: ApplicationStatus[] = [
  "Draft",
  "Sent to Leasing",
  "Survey",
  "Approved",
  "Disbursed",
  "Rejected",
];
const ACTIVE_STATUSES = ["Draft", "Sent to Leasing", "Survey", "Approved"];

interface ApplicationDbRow {
  id: string;
  agent_id: string;
  leasing_partner: string;
  nominal_pengajuan: number;
  nominal_pencairan: number | null;
  status_aplikasi: string;
  created_at: string;
  rejection_reason: string | null;
  contacts: { nama: string } | { nama: string }[] | null;
  users: { name: string } | { name: string }[] | null;
}

function singularize<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function AdminApplicationsPage({
  searchParams,
}: PageProps<"/admin/applications">) {
  const params = await searchParams;
  const today = todayWib();
  const fromParam = params.from;
  const toParam = params.to;
  const from = typeof fromParam === "string" ? fromParam : startOfMonthWib(today);
  const to = typeof toParam === "string" ? toParam : today;

  const statusParam = params.status;
  const agentParam = params.agent;
  const leasingParam = params.leasing;

  const statuses =
    typeof statusParam === "string" && statusParam.length > 0
      ? statusParam.split(",")
      : ALL_STATUSES;
  const agent = typeof agentParam === "string" ? agentParam : "all";
  const leasing = typeof leasingParam === "string" ? leasingParam : "all";

  const supabase = await createClient();

  const { data: agentRows } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("name");
  const agents = agentRows ?? [];

  let query = supabase
    .from("applications")
    .select(
      "id, agent_id, leasing_partner, nominal_pengajuan, nominal_pencairan, status_aplikasi, created_at, rejection_reason, contacts(nama), users(name)"
    )
    .gte("created_at", wibDayStartIso(from))
    .lte("created_at", wibDayEndIso(to))
    .order("created_at", { ascending: false });

  if (statuses.length > 0 && statuses.length < ALL_STATUSES.length) {
    query = query.in("status_aplikasi", statuses);
  }
  if (agent !== "all") {
    query = query.eq("agent_id", agent);
  }
  if (leasing !== "all") {
    query = query.eq("leasing_partner", leasing);
  }

  const { data: appRows } = await query;
  const apps = (appRows ?? []) as unknown as ApplicationDbRow[];

  const rows: AdminApplicationRow[] = apps.map((a) => ({
    id: a.id,
    agentName: singularize(a.users)?.name ?? "—",
    contactName: singularize(a.contacts)?.nama ?? "—",
    leasingPartner: a.leasing_partner,
    nominalPengajuan: a.nominal_pengajuan,
    nominalPencairan: a.nominal_pencairan,
    statusAplikasi: a.status_aplikasi as ApplicationStatus,
    createdAt: a.created_at,
    rejectionReason: a.rejection_reason,
  }));

  // Daftar leasing partner untuk dropdown - dari seluruh data periode ini
  // (tidak ada tabel leasing_partners formal, jadi diambil dari nilai yang
  // benar-benar dipakai).
  const leasingPartners = [...new Set(apps.map((a) => a.leasing_partner))].sort();

  const totalAplikasi = rows.length;
  const dalamProses = rows.filter((r) => ACTIVE_STATUSES.includes(r.statusAplikasi)).length;
  const disbursedRows = rows.filter((r) => r.statusAplikasi === "Disbursed");
  const totalPencairan = disbursedRows.reduce((sum, r) => sum + (r.nominalPencairan ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Seluruh aplikasi pembiayaan dari semua agen, satu layar.
        </p>
      </div>

      <DateRangeFilter from={from} to={to} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Aplikasi" value={String(totalAplikasi)} icon={FileStack} />
        <KpiCard label="Dalam Proses" value={String(dalamProses)} icon={Clock} />
        <KpiCard label="Disbursed" value={String(disbursedRows.length)} icon={CircleCheck} tone="success" />
        <KpiCard
          label="Total Pencairan"
          value={formatCompactRupiah(totalPencairan)}
          icon={Banknote}
          tone="success"
        />
      </div>

      <ApplicationsFilterBar
        statuses={statuses}
        allStatuses={ALL_STATUSES}
        agent={agent}
        agents={agents.map((a) => ({ id: a.id, name: a.name }))}
        leasing={leasing}
        leasingPartners={leasingPartners}
      />

      <ApplicationsTable rows={rows} />
    </div>
  );
}
