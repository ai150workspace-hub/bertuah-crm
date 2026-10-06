"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseZap } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { setUncalledClaimEnabled } from "@/app/actions/pengambilan-data";
import type { PengambilanDataSnapshot } from "@/lib/admin-metrics";

type Rekomendasi = "tutup" | "buka" | "pertahankan";

// Ambang buka dan tutup SENGAJA berbeda (histeresis) supaya rekomendasi tidak
// berganti-ganti tiap hari: persediaan >= kapasitas -> tutup, persediaan <
// separuh kapasitas -> buka, di antaranya -> pertahankan posisi sekarang.
function hitungRekomendasi(persediaan: number, kapasitas: number): Rekomendasi {
  if (kapasitas <= 0) return "pertahankan";
  if (persediaan >= kapasitas) return "tutup";
  if (persediaan < kapasitas / 2) return "buka";
  return "pertahankan";
}

function formatDesimal(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function PengambilanDataCard({
  snapshot,
  canToggle,
}: {
  snapshot: PengambilanDataSnapshot;
  /** false untuk admin monitoring (is_restricted_admin) - action di server tetap memblokir juga. */
  canToggle: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { terbuka, persediaan, diTanganAgen, diPool, kapasitas, jumlahAgen, targetPerAgen } = snapshot;
  const rekomendasi = hitungRekomendasi(persediaan, kapasitas);

  // Amber cuma kalau rekomendasinya MENGUBAH status sekarang; kalau sama
  // (mis. disarankan tutup padahal sudah tertutup), abu - tidak ada yang
  // perlu dilakukan.
  const perluTindakan =
    (rekomendasi === "tutup" && terbuka) || (rekomendasi === "buka" && !terbuka);
  const labelRekomendasi =
    rekomendasi === "tutup"
      ? "Disarankan TUTUP"
      : rekomendasi === "buka"
        ? "Disarankan BUKA"
        : "Pertahankan posisi sekarang";

  async function handleToggle() {
    setSaving(true);
    const result = await setUncalledClaimEnabled(!terbuka);
    setSaving(false);
    setConfirmOpen(false);
    if (!result.success) {
      toast.error("Gagal mengubah pengambilan data baru.", { description: result.error });
      return;
    }
    toast.success(terbuka ? "Pengambilan data baru ditutup." : "Pengambilan data baru dibuka.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4 text-muted-foreground" />
          Pengambilan Data Baru
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Status sekarang:</span>
              <Badge
                variant="outline"
                className={cn(
                  terbuka
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-destructive/10 text-destructive border-destructive/30"
                )}
              >
                {terbuka ? "Terbuka" : "Tertutup"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {terbuka
                ? "Agen bisa mengambil data baru (Uncalled) lewat Ambil Data Baru."
                : "Agen hanya mendapat data daur ulang (Warm dan In Progress)."}
            </p>
          </div>
          {canToggle ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              {terbuka ? "Tutup Pengambilan" : "Buka Pengambilan"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              Hanya admin penuh yang bisa mengubah.
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">Persediaan kerja daur ulang</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(persediaan)} panggilan
            </div>
            <div className="text-[11px] text-muted-foreground">
              di tangan agen: {formatNumber(diTanganAgen)} · di pool: {formatNumber(diPool)}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">Kapasitas tim hari ini</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatNumber(kapasitas)} panggilan
            </div>
            <div className="text-[11px] text-muted-foreground">
              {jumlahAgen} agen aktif × {formatNumber(targetPerAgen)}
            </div>
          </div>
        </div>

        <div className="space-y-1 border-t pt-3">
          <p
            className={cn(
              "text-sm font-medium",
              perluTindakan ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
            )}
          >
            {labelRekomendasi}
            {!perluTindakan && rekomendasi !== "pertahankan" && " · sudah sesuai status sekarang"}
          </p>
          <p className="text-xs text-muted-foreground">
            {kapasitas > 0
              ? `Perkiraan ${formatNumber(persediaan)} panggilan ≈ ${formatDesimal(persediaan / kapasitas)} hari kerja`
              : "Perkiraan hari kerja belum bisa dihitung (tidak ada agen aktif)."}
          </p>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {terbuka ? "Tutup pengambilan data baru?" : "Buka pengambilan data baru?"}
            </DialogTitle>
            <DialogDescription>
              {terbuka
                ? "Agen tidak akan bisa mengambil data baru (Uncalled) lewat tombol Ambil Data Baru. Data daur ulang (Warm dan In Progress) tetap bisa diambil."
                : "Agen akan kembali bisa mengambil data baru (Uncalled) lewat tombol Ambil Data Baru, setelah data daur ulang."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleToggle} disabled={saving}>
              {saving ? "Menyimpan..." : terbuka ? "Ya, tutup" : "Ya, buka"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
