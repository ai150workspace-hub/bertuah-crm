import Link from "next/link";
import { Globe, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { WebLeadsSnapshot } from "@/lib/admin-metrics";

// Server Component murni tampilan, snapshot SEMUA WAKTU (tidak terikat
// filter tanggal Dashboard) - lihat lib/admin-metrics.ts getWebLeadsSnapshot.
// status_call = 'Inbound' sebelumnya tidak muncul di mana pun di admin UI
// (tidak ada di filter Contacts, tidak ada di breakdown Dashboard manapun).
export function WebLeadsCard({ snapshot }: { snapshot: WebLeadsSnapshot }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Lead dari Website
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {snapshot.total === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada lead baru dari website.</p>
        ) : (
          <>
            <div>
              <div className="text-2xl font-semibold tabular-nums">{snapshot.total}</div>
              <p className="text-xs text-muted-foreground">
                belum ditindaklanjuti sama sekali
                {snapshot.belumDiAssign > 0 && ` · ${snapshot.belumDiAssign} belum di-assign ke agen`}
              </p>
            </div>
            <Button variant="outline" size="sm" className="w-full" nativeButton={false} render={
              <Link href="/admin/contacts?status=Inbound">
                Lihat & assign <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            } />
          </>
        )}
      </CardContent>
    </Card>
  );
}
