import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { DatabaseStatusSnapshot } from "@/lib/admin-metrics";

// Server Component murni tampilan, snapshot kumulatif SEMUA WAKTU - tidak
// menerima/menerapkan filter tanggal Dashboard sama sekali (lihat
// lib/admin-metrics.ts getDatabaseStatusSnapshot).
export function DatabaseStatusCard({ snapshot }: { snapshot: DatabaseStatusSnapshot }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status Database (Semua Waktu)</CardTitle>
      </CardHeader>
      <CardContent>
        {!snapshot.adaRiwayatUpload ? (
          <p className="text-sm text-muted-foreground">Belum ada riwayat upload data.</p>
        ) : (
          <DatabaseStatusBody snapshot={snapshot} />
        )}
      </CardContent>
    </Card>
  );
}

function DatabaseStatusBody({ snapshot }: { snapshot: DatabaseStatusSnapshot }) {
  // Persentase dihitung dari kontak yang benar-benar ada saat ini
  // (sudahDikerjakan + belumDisentuh = totalSaatIni, selalu pas karena
  // status_call NOT NULL) - bukan dari totalUploaded, yang bisa beda
  // (lihat catatan di admin-metrics.ts).
  const pct = snapshot.totalSaatIni > 0 ? (snapshot.sudahDikerjakan / snapshot.totalSaatIni) * 100 : 0;
  const barColor = pct > 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-destructive";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{Math.round(pct)}% sudah dikerjakan</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatNumber(snapshot.totalUploaded)} data ter-upload · {formatNumber(snapshot.sudahDikerjakan)}{" "}
        sudah dikerjakan · {formatNumber(snapshot.belumDisentuh)} belum disentuh
      </p>
    </div>
  );
}
