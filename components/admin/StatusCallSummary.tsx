import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusCallSummaryGroup } from "@/lib/admin-metrics";

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
          {groups.map((group) => (
            <div key={group.grup} className="space-y-2">
              <div className="flex items-center justify-between border-b pb-1.5">
                <h3 className="text-sm font-medium">{group.grup}</h3>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {group.subtotal}
                </span>
              </div>
              <dl className="space-y-1.5">
                {group.items.map((item) => (
                  <div key={item.kode} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="font-medium tabular-nums">{item.count}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
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
