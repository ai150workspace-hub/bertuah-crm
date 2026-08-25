import { PhoneCall, TrendingUp, Flame, FileStack, CircleCheck, Banknote } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DateRangeFilter } from "@/components/admin/date-range-filter";
import {
  MiniFunnel,
  CallDistributionBar,
  type AgentFunnelStage,
  type AgentCallDistribution,
} from "@/components/admin/agents-report-table";
import { formatPercent, formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { wibDayStartIso, wibDayEndIso, todayWib, startOfMonthWib } from "@/lib/wib-date";
import { adalahRpc } from "@/lib/call-outcome/derive";
import { HASIL_PANGGILAN, type KodeHasil } from "@/lib/call-outcome/catalog";

const HASIL_LABEL = new Map(HASIL_PANGGILAN.map((h) => [h.kode, h.label]));
const HASIL_STATUS_KONTAK = new Map(HASIL_PANGGILAN.map((h) => [h.kode, h.statusKontak]));
const RECENT_CALLS_LIMIT = 10;

interface ContactStatusRow {
  status_call: string;
}

interface CallLogPeriodeRow {
  level_1: string;
  hasil: string | null;
}

interface CallLogRecentRow {
  timestamp: string;
  hasil: string | null;
  call_duration: number | null;
  contacts: { nama: string } | { nama: string }[] | null;
}

interface ApplicationRow {
  status_aplikasi: string;
  nominal_pencairan: number | null;
  created_at: string;
  date_disbursed: string | null;
}

function contactName(c: CallLogRecentRow["contacts"]): string {
  if (!c) return "—";
  return Array.isArray(c) ? (c[0]?.nama ?? "—") : c.nama;
}

function formatDuration(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}d` : `${s}d`;
}

export default async function AgentPerformancePage({
  searchParams,
}: PageProps<"/agent/performance">) {
  const params = await searchParams;
  const today = todayWib();
  const fromParam = params.from;
  const toParam = params.to;
  const from = typeof fromParam === "string" ? fromParam : startOfMonthWib(today);
  const to = typeof toParam === "string" ? toParam : today;
  const startIso = wibDayStartIso(from);
  const endIso = wibDayEndIso(to);

  const profile = await getCurrentUser();
  const supabase = await createClient();

  // 4 query independen (tidak saling butuh hasil satu sama lain) - jalan
  // bareng, bukan berurutan. Semua di-scope ke agent yang login saja
  // (bukan seluruh tim), sama seperti /agent/dashboard dan /agent/queue.
  const [{ data: contactRows }, { data: periodeLogRows }, { data: recentLogRows }, { data: appRows }] =
    profile
      ? await Promise.all([
          supabase
            .from("contacts")
            .select("status_call")
            .eq("assigned_to", profile.id)
            // Safety cap - sesuai catatan di /agent/queue, jaga-jaga kalau
            // kapasitas seorang agent suatu saat di-set sangat besar.
            .limit(500),
          supabase
            .from("call_logs")
            .select("level_1, hasil")
            .eq("agent_id", profile.id)
            .gte("timestamp", startIso)
            .lte("timestamp", endIso),
          supabase
            .from("call_logs")
            .select("timestamp, hasil, call_duration, contacts(nama)")
            .eq("agent_id", profile.id)
            .order("timestamp", { ascending: false })
            .limit(RECENT_CALLS_LIMIT),
          supabase
            .from("applications")
            .select("status_aplikasi, nominal_pencairan, created_at, date_disbursed")
            .eq("agent_id", profile.id),
        ])
      : [{ data: null }, { data: null }, { data: null }, { data: null }];

  const contacts = (contactRows ?? []) as ContactStatusRow[];
  const periodeLogs = (periodeLogRows ?? []) as CallLogPeriodeRow[];
  const recentLogs = (recentLogRows ?? []) as unknown as CallLogRecentRow[];
  const apps = (appRows ?? []) as ApplicationRow[];

  // ---- KPI periode terpilih ----
  const totalCall = periodeLogs.length;
  // "Connected" dihitung via adalahRpc(hasil), bukan level_1='CONNECTED'
  // mentah - konsisten dengan /admin/agents dan /agent/dashboard.
  const connected = periodeLogs.filter((l) => l.hasil && adalahRpc(l.hasil as KodeHasil)).length;
  const contactRatePercent = totalCall > 0 ? (connected / totalCall) * 100 : null;

  const aplikasiMasuk = apps.filter((a) => a.created_at >= startIso && a.created_at <= endIso).length;
  const disbursedPeriode = apps.filter(
    (a) => a.status_aplikasi === "Disbursed" && a.date_disbursed && a.date_disbursed >= from && a.date_disbursed <= to
  );
  const disbursedCount = disbursedPeriode.length;
  const totalPencairan = disbursedPeriode.reduce((sum, a) => sum + (a.nominal_pencairan ?? 0), 0);

  // ---- Pipeline & Hot Lead (kondisi saat ini, bukan periode - sama
  // seperti definisi di /admin/agents dan Hot Leads di /agent/dashboard) ----
  const uncalledCount = contacts.filter((c) => c.status_call === "Uncalled").length;
  const inProgressCount = contacts.filter((c) => c.status_call === "In Progress").length;
  const warmCount = contacts.filter((c) => c.status_call === "Warm").length;
  const hotLeadCount = contacts.filter((c) => c.status_call === "Hot Lead").length;
  const sudahDikerjakan = contacts.filter(
    (c) => c.status_call !== "Uncalled" && c.status_call !== "Invalid"
  ).length;
  const conversionRatePercent = sudahDikerjakan > 0 ? (hotLeadCount / sudahDikerjakan) * 100 : null;

  const appsDisbursedAllTime = apps.filter((a) => a.status_aplikasi === "Disbursed").length;
  const funnel: AgentFunnelStage[] = [
    { label: "Uncalled", value: uncalledCount },
    { label: "In Progress", value: inProgressCount },
    { label: "Warm", value: warmCount },
    { label: "Hot Lead", value: hotLeadCount },
    { label: "Aplikasi", value: apps.length },
    { label: "Disbursed", value: appsDisbursedAllTime },
  ];

  const callDistribution: AgentCallDistribution = {
    connected: 0,
    unconnected: 0,
    hotLead: 0,
    warm: 0,
    inProgress: 0,
    closed: 0,
  };
  for (const l of periodeLogs) {
    if (l.level_1 === "CONNECTED") callDistribution.connected += 1;
    else callDistribution.unconnected += 1;
    if (l.hasil) {
      const sk = HASIL_STATUS_KONTAK.get(l.hasil as KodeHasil);
      if (sk === "Hot Lead") callDistribution.hotLead += 1;
      else if (sk === "Warm") callDistribution.warm += 1;
      else if (sk === "In Progress") callDistribution.inProgress += 1;
      else if (sk === "Closed") callDistribution.closed += 1;
    }
  }

  const recentCalls = recentLogs.map((l) => ({
    timestamp: l.timestamp,
    contactName: contactName(l.contacts),
    hasilLabel: l.hasil ? (HASIL_LABEL.get(l.hasil as KodeHasil) ?? l.hasil) : "—",
    durationSec: l.call_duration,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Performa Saya</h1>
        <p className="text-sm text-muted-foreground">
          Rekap aktivitas dan hasil kerja kamu, per periode.
        </p>
      </div>

      <DateRangeFilter from={from} to={to} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Call" value={String(totalCall)} icon={PhoneCall} hint="periode terpilih" />
        <KpiCard
          label="Contact Rate"
          value={contactRatePercent === null ? "—" : formatPercent(contactRatePercent)}
          icon={TrendingUp}
          hint="periode terpilih"
        />
        <KpiCard label="Hot Lead" value={String(hotLeadCount)} icon={Flame} tone="hot" hint="kondisi saat ini" />
        <KpiCard
          label="Conversion Rate"
          value={conversionRatePercent === null ? "—" : formatPercent(conversionRatePercent)}
          icon={TrendingUp}
          hint="kondisi saat ini"
        />
        <KpiCard label="Aplikasi Masuk" value={String(aplikasiMasuk)} icon={FileStack} hint="periode terpilih" />
        <KpiCard
          label="Disbursed"
          value={String(disbursedCount)}
          icon={CircleCheck}
          tone="success"
          hint="periode terpilih"
        />
        <KpiCard
          label="Total Pencairan"
          value={formatRupiah(totalPencairan)}
          icon={Banknote}
          tone="success"
          hint="periode terpilih"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <div className="mb-2 text-sm font-semibold">Funnel Pipeline</div>
          <MiniFunnel stages={funnel} />
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">Distribusi Hasil Call (periode terpilih)</div>
          <CallDistributionBar dist={callDistribution} />
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">{RECENT_CALLS_LIMIT} Call Log Terakhir</div>
          <div className="space-y-1.5">
            {recentCalls.length === 0 && (
              <div className="text-xs text-muted-foreground">Belum ada call log.</div>
            )}
            {recentCalls.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 text-xs last:border-0"
              >
                <span className="w-20 shrink-0 text-muted-foreground">
                  {new Date(c.timestamp).toLocaleDateString("id-ID")}
                </span>
                <span className="flex-1 truncate">{c.contactName}</span>
                <span className="w-28 shrink-0 truncate text-muted-foreground">{c.hasilLabel}</span>
                <span className="w-12 shrink-0 text-right tabular-nums">{formatDuration(c.durationSec)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
