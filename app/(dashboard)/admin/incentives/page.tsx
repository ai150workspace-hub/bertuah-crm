import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { calculateAgentIncentive } from "@/lib/incentive-calculator";
import { IncentivePeriodPicker } from "@/components/admin/incentive-period-picker";
import { ExportIncentiveCsvButton } from "@/components/admin/export-incentive-csv-button";
import { LockMonthButton } from "@/components/admin/incentives/lock-month-button";
import {
  AgentIncentiveRow,
  type AgentIncentiveRowData,
  type DealDetail,
} from "@/components/admin/incentives/agent-incentive-row";
import { IncentiveHistory, type HistoryPeriod } from "@/components/admin/incentives/incentive-history";
import { todayWib } from "@/lib/wib-date";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface ApplicationDealRow {
  id: string;
  agent_id: string;
  nominal_pencairan: number | null;
  tenor_bulan: number | null;
  date_disbursed: string | null;
  contacts: { nama: string } | { nama: string }[] | null;
}

function contactName(c: ApplicationDealRow["contacts"]): string {
  if (!c) return "—";
  return Array.isArray(c) ? (c[0]?.nama ?? "—") : c.nama;
}

export default async function AdminIncentivesPage({
  searchParams,
}: PageProps<"/admin/incentives">) {
  const params = await searchParams;
  const today = todayWib();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const incMonthParam = params.incMonth;
  const incYearParam = params.incYear;
  const month =
    typeof incMonthParam === "string" && Number(incMonthParam) >= 1 && Number(incMonthParam) <= 12
      ? Number(incMonthParam)
      : todayMonth!;
  const year =
    typeof incYearParam === "string" && Number.isInteger(Number(incYearParam))
      ? Number(incYearParam)
      : todayYear!;

  const supabase = await createClient();

  const { data: agentRows } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("name");
  const agents = agentRows ?? [];

  const { data: snapshotRows } = await supabase
    .from("incentive_snapshots")
    .select("*")
    .eq("periode_bulan", month)
    .eq("periode_tahun", year);
  const snapshots = snapshotRows ?? [];
  const snapshotByAgent = new Map(snapshots.map((s) => [s.agent_id, s]));
  const isLocked = snapshots.length > 0;

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEndExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const { data: appRows } = await supabase
    .from("applications")
    .select("id, agent_id, nominal_pencairan, tenor_bulan, date_disbursed, contacts(nama)")
    .eq("status_aplikasi", "Disbursed")
    .gte("date_disbursed", monthStart)
    .lt("date_disbursed", monthEndExclusive);
  const deals = (appRows ?? []) as unknown as ApplicationDealRow[];

  const dealsByAgent = new Map<string, DealDetail[]>();
  const rawDealsByAgent = new Map<string, { nominalPencairan: number; tenorBulan: number }[]>();
  for (const d of deals) {
    const detail: DealDetail = {
      applicationId: d.id,
      contactName: contactName(d.contacts),
      nominalPencairan: d.nominal_pencairan ?? 0,
      tenorBulan: d.tenor_bulan ?? 12,
      dateDisbursed: d.date_disbursed,
    };
    dealsByAgent.set(d.agent_id, [...(dealsByAgent.get(d.agent_id) ?? []), detail]);
    rawDealsByAgent.set(d.agent_id, [
      ...(rawDealsByAgent.get(d.agent_id) ?? []),
      { nominalPencairan: detail.nominalPencairan, tenorBulan: detail.tenorBulan },
    ]);
  }

  const rows: AgentIncentiveRowData[] = agents.map((a) => {
    const snap = snapshotByAgent.get(a.id);
    if (snap) {
      // Terkunci - pakai angka beku, JANGAN tampilkan drill-down deal (data
      // aplikasi saat ini bisa sudah tidak sinkron dengan angka yang dikunci).
      return {
        agentId: a.id,
        agentName: a.name,
        totalPencairan: snap.total_pencairan,
        totalDailyKomisi: snap.total_komisi_harian,
        monthlyBonus: snap.bonus_bulanan,
        takeHome: snap.take_home,
        revenuePku: snap.revenue_pku,
        netPku: snap.net_pku,
        marginPkuPct: snap.margin_pku_pct,
        tierLabel: snap.tier_label ?? "",
        deals: [],
      };
    }
    const r = calculateAgentIncentive(
      { agentId: a.id, agentName: a.name, deals: rawDealsByAgent.get(a.id) ?? [] },
      agents.length
    );
    return { ...r, deals: dealsByAgent.get(a.id) ?? [] };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      totalPencairan: acc.totalPencairan + r.totalPencairan,
      totalDailyKomisi: acc.totalDailyKomisi + r.totalDailyKomisi,
      monthlyBonus: acc.monthlyBonus + r.monthlyBonus,
      takeHome: acc.takeHome + r.takeHome,
      revenuePku: acc.revenuePku + r.revenuePku,
      netPku: acc.netPku + r.netPku,
    }),
    { totalPencairan: 0, totalDailyKomisi: 0, monthlyBonus: 0, takeHome: 0, revenuePku: 0, netPku: 0 }
  );

  // Riwayat 6 bulan terakhir (agregat semua agent per periode terkunci)
  const { data: historyRows } = await supabase
    .from("incentive_snapshots")
    .select("periode_bulan, periode_tahun, take_home, net_pku")
    .order("periode_tahun", { ascending: false })
    .order("periode_bulan", { ascending: false })
    .limit(500);
  const historyMap = new Map<string, HistoryPeriod>();
  for (const h of historyRows ?? []) {
    const key = `${h.periode_tahun}-${h.periode_bulan}`;
    const existing = historyMap.get(key);
    if (existing) {
      existing.totalTakeHome += h.take_home;
      existing.totalNetPku += h.net_pku;
      existing.agentCount += 1;
    } else {
      historyMap.set(key, {
        bulan: h.periode_bulan,
        tahun: h.periode_tahun,
        totalTakeHome: h.take_home,
        totalNetPku: h.net_pku,
        agentCount: 1,
      });
    }
  }
  const historyPeriods = [...historyMap.values()].slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Insentif</h1>
        <p className="text-sm text-muted-foreground">
          Kalkulasi take-home agent &amp; margin PKU, per bulan — bisa dikunci untuk finalisasi.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>
              {BULAN[month - 1]} {year}
            </CardTitle>
            {isLocked ? (
              <Badge variant="outline" className="gap-1 bg-success/15 text-success border-success/30">
                <Lock className="h-3 w-3" /> Terkunci
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                Belum Dikunci
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IncentivePeriodPicker month={month} year={year} />
            <ExportIncentiveCsvButton rows={rows} month={month} year={year} />
            <LockMonthButton month={month} year={year} locked={isLocked} />
          </div>
        </CardHeader>
        <CardContent>
          {!isLocked && (
            <CardDescription className="mb-3">
              Angka masih dihitung live dari data aplikasi — klik baris agent untuk lihat
              rincian deal, atau kunci periode ini kalau sudah final.
            </CardDescription>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Agen</TableHead>
                  <TableHead>Total Pencairan</TableHead>
                  <TableHead>Komisi Harian</TableHead>
                  <TableHead>Bonus Bulanan</TableHead>
                  <TableHead>Take-Home</TableHead>
                  <TableHead>Revenue PKU</TableHead>
                  <TableHead>Net PKU</TableHead>
                  <TableHead>Margin PKU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <AgentIncentiveRow key={row.agentId} row={row} />
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Belum ada agent aktif.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {rows.length > 0 && (
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell>{formatRupiah(totals.totalPencairan)}</TableCell>
                    <TableCell>{formatRupiah(totals.totalDailyKomisi)}</TableCell>
                    <TableCell>
                      {totals.monthlyBonus === 0 ? "—" : formatRupiah(totals.monthlyBonus)}
                    </TableCell>
                    <TableCell className="text-foreground">
                      {formatRupiah(totals.takeHome)}
                    </TableCell>
                    <TableCell className="text-success">
                      {formatRupiah(totals.revenuePku)}
                    </TableCell>
                    <TableCell className={totals.netPku >= 0 ? "text-success" : "text-destructive"}>
                      {formatRupiah(totals.netPku)}
                    </TableCell>
                    <TableCell>
                      {totals.revenuePku === 0
                        ? "—"
                        : `${((totals.netPku / totals.revenuePku) * 100).toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      <IncentiveHistory periods={historyPeriods} />
    </div>
  );
}
