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
  // Persentase dihitung dari kontak yang BISA dikerjakan saat ini
  // (totalBisaDikerjakan = totalSaatIni - diarsipkan) - arsip tidak ikut di
  // penyebut karena tidak bisa dikerjakan siapa pun. Bukan dari
  // totalUploaded, yang bisa beda (lihat catatan di admin-metrics.ts).
  const pct =
    snapshot.totalBisaDikerjakan > 0 ? (snapshot.sudahDikerjakan / snapshot.totalBisaDikerjakan) * 100 : 0;
  const barColor = pct > 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-destructive";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{Math.round(pct)}% dari data yang bisa dikerjakan</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatNumber(snapshot.totalUploaded)} data ter-upload (termasuk baris duplikat &amp; tidak valid
        yang ditolak saat impor) · {formatNumber(snapshot.sudahDikerjakan)} sudah dikerjakan ·{" "}
        {formatNumber(snapshot.belumDisentuh)} belum disentuh
        {snapshot.diarsipkan > 0 && <> · {formatNumber(snapshot.diarsipkan)} diarsipkan</>}
      </p>
      {snapshot.belumDisentuh === 0 && snapshot.diarsipkan > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Tidak ada data baru yang bisa dikerjakan - perlu impor data segar.
        </p>
      )}
    </div>
  );
}
