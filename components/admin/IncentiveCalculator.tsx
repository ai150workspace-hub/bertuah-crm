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
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { calculateAgentIncentive, type AgentIncentiveResult } from "@/lib/incentive-calculator";
import { IncentivePeriodPicker } from "./incentive-period-picker";
import { ExportIncentiveCsvButton } from "./export-incentive-csv-button";
import { cn } from "@/lib/utils";

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

function tierBadgeClassName(bonus: number): string {
  if (bonus === 0) return "bg-muted text-muted-foreground border-transparent";
  if (bonus < 2_000_000) return "bg-primary/10 text-primary border-primary/20";
  if (bonus < 4_000_000)
    return "bg-warning/15 text-warning-foreground border-warning/30";
  if (bonus < 6_000_000) return "bg-success/15 text-success border-success/30";
  return "bg-hot/15 text-hot border-hot/30 font-semibold";
}

function marginClassName(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct > 30) return "text-success font-medium";
  if (pct >= 10) return "text-warning-foreground font-medium";
  return "text-destructive font-medium";
}

interface DealRow {
  agent_id: string;
  nominal_pencairan: number | null;
  tenor_bulan: number | null;
}

export async function IncentiveCalculator({
  month,
  year,
  isRestrictedAdmin,
}: {
  month: number;
  year: number;
  isRestrictedAdmin?: boolean;
}) {
  const supabase = await createClient();

  const { data: agentRows } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("name");
  const agents = agentRows ?? [];

  const monthPadded = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthPadded}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEndExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const { data: appRows } = await supabase
    .from("applications")
    .select("agent_id, nominal_pencairan, tenor_bulan")
    .eq("status_aplikasi", "Disbursed")
    .gte("date_disbursed", monthStart)
    .lt("date_disbursed", monthEndExclusive);

  const deals = (appRows ?? []) as DealRow[];
  const dealsByAgent = new Map<string, { nominalPencairan: number; tenorBulan: number }[]>();
  for (const d of deals) {
    const list = dealsByAgent.get(d.agent_id) ?? [];
    list.push({
      nominalPencairan: d.nominal_pencairan ?? 0,
      tenorBulan: d.tenor_bulan ?? 12,
    });
    dealsByAgent.set(d.agent_id, list);
  }

  const results: AgentIncentiveResult[] = agents.map((a) =>
    calculateAgentIncentive(
      { agentId: a.id, agentName: a.name, deals: dealsByAgent.get(a.id) ?? [] },
      agents.length
    )
  );

  const totals = results.reduce(
    (acc, r) => ({
      totalPencairan: acc.totalPencairan + r.totalPencairan,
      totalDailyKomisi: acc.totalDailyKomisi + r.totalDailyKomisi,
      monthlyBonus: acc.monthlyBonus + r.monthlyBonus,
      takeHome: acc.takeHome + r.takeHome,
      revenuePku: acc.revenuePku + r.revenuePku,
      netPku: acc.netPku + r.netPku,
    }),
    {
      totalPencairan: 0,
      totalDailyKomisi: 0,
      monthlyBonus: 0,
      takeHome: 0,
      revenuePku: 0,
      netPku: 0,
    }
  );
  // Margin gabungan dari total (bukan rata-rata persentase per agent) -
  // supaya agent bernominal besar tidak "ditenggelamkan" agent kecil.
  const avgMarginPct = totals.revenuePku === 0 ? null : (totals.netPku / totals.revenuePku) * 100;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Incentive Calculator</CardTitle>
          <CardDescription>
            Take-home agent &amp; margin PKU per bulan, dihitung dari deal Disbursed.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <IncentivePeriodPicker month={month} year={year} />
          {!isRestrictedAdmin && (
            <ExportIncentiveCsvButton rows={results} month={month} year={year} />
          )}
        </div>
      </CardHeader>
      <CardContent>
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
              {results.map((r) => (
                <TableRow key={r.agentId}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.agentName}
                      <Badge variant="outline" className={cn("text-[10px]", tierBadgeClassName(r.monthlyBonus))}>
                        {r.tierLabel}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{formatRupiah(r.totalPencairan)}</TableCell>
                  <TableCell>{formatRupiah(r.totalDailyKomisi)}</TableCell>
                  <TableCell>
                    {r.monthlyBonus === 0 ? "—" : formatRupiah(r.monthlyBonus)}
                  </TableCell>
                  <TableCell className="font-bold text-foreground">
                    {formatRupiah(r.takeHome)}
                  </TableCell>
                  <TableCell className="text-success">{formatRupiah(r.revenuePku)}</TableCell>
                  <TableCell className={r.netPku >= 0 ? "text-success" : "text-destructive"}>
                    {formatRupiah(r.netPku)}
                  </TableCell>
                  <TableCell className={marginClassName(r.marginPkuPct)}>
                    {r.marginPkuPct === null ? "—" : `${r.marginPkuPct.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              ))}
              {results.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Belum ada agent aktif.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {results.length > 0 && (
              <tfoot>
                <TableRow className="font-bold bg-muted/40">
                  <TableCell>TOTAL</TableCell>
                  <TableCell>{formatRupiah(totals.totalPencairan)}</TableCell>
                  <TableCell>{formatRupiah(totals.totalDailyKomisi)}</TableCell>
                  <TableCell>
                    {totals.monthlyBonus === 0 ? "—" : formatRupiah(totals.monthlyBonus)}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {formatRupiah(totals.takeHome)}
                  </TableCell>
                  <TableCell className="text-success">{formatRupiah(totals.revenuePku)}</TableCell>
                  <TableCell className={totals.netPku >= 0 ? "text-success" : "text-destructive"}>
                    {formatRupiah(totals.netPku)}
                  </TableCell>
                  <TableCell className={marginClassName(avgMarginPct)}>
                    {avgMarginPct === null ? "—" : `${avgMarginPct.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
