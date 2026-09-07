import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatusCallSummaryGroup } from "@/lib/admin-metrics";

// 2 kode Hot Lead di grup "Bicara dengan orangnya" - disorot gold/orange
// karena ini yang paling bernilai untuk direplikasi. Tidak diambil dari
// tempat lain karena cuma dipakai untuk styling tampilan, bukan logika
// bisnis (logika bisnis Hot Lead ada di lib/call-outcome/catalog.ts
// statusKontak: 'Hot Lead').
const HOT_LEAD_KODE = new Set(["MINAT", "JANJI_TEMU"]);

function formatPercent(n: number): string {
  return `${Math.round(n)}%`;
}

// Server Component murni tampilan - tidak ada state/interaksi sendiri,
// filter tanggalnya di-reuse dari DateRangeFilter yang sudah ada di
// halaman Dashboard (lihat app/(dashboard)/admin/dashboard/page.tsx).
export function StatusCallSummary({
  groups,
  totalCalls,
  belumTercatat,
}: {
  groups: StatusCallSummaryGroup[];
  totalCalls: number;
  belumTercatat: number;
}) {
  const totalDariBreakdown = groups.reduce((sum, g) => sum + g.subtotal, 0) + belumTercatat;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ringkasan per Status Call</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-3">
          {groups.map((group) => {
            const pctDariTotal = totalCalls > 0 ? (group.subtotal / totalCalls) * 100 : 0;
            const items = [...group.items].sort((a, b) => b.count - a.count);

            return (
              <div key={group.grup} className="space-y-2">
                <div className="space-y-0.5 border-b pb-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{group.grup}</h3>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {group.subtotal}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {group.subtotal} dari {totalCalls} panggilan — {formatPercent(pctDariTotal)}
                  </p>
                </div>
                <dl className="space-y-2">
                  {items.map((item) => {
                    const hot = HOT_LEAD_KODE.has(item.kode);
                    const pctDalamGrup = group.subtotal > 0 ? (item.count / group.subtotal) * 100 : 0;
                    return (
                      <div key={item.kode} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <dt className={cn(hot && "font-medium text-hot")}>{item.label}</dt>
                          <dd className={cn("font-medium tabular-nums", hot && "text-hot")}>
                            {item.count}
                          </dd>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full", hot ? "bg-hot" : "bg-primary/70")}
                            style={{ width: `${pctDalamGrup}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </dl>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            Total keseluruhan
            {belumTercatat > 0 && (
              <span className="ml-1">
                (termasuk {belumTercatat} data lama tanpa hasil tercatat)
              </span>
            )}
          </span>
          <span className="font-semibold tabular-nums">{totalDariBreakdown}</span>
        </div>
        {totalDariBreakdown !== totalCalls && (
          <p className="text-xs text-destructive">
            Tidak sinkron dengan card &quot;Total Panggilan&quot; ({totalCalls}) — laporkan ke tim
            teknis.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
