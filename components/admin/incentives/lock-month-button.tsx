"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { lockIncentiveMonth, unlockIncentiveMonth } from "@/app/actions/incentives";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function LockMonthButton({
  month,
  year,
  locked,
}: {
  month: number;
  year: number;
  locked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  async function handleConfirm() {
    setWorking(true);
    const result = locked
      ? await unlockIncentiveMonth(month, year)
      : await lockIncentiveMonth(month, year);
    setWorking(false);
    setOpen(false);

    if (!result.success) {
      toast.error(locked ? "Gagal membuka kunci." : "Gagal mengunci.", {
        description: result.error,
      });
      return;
    }
    toast.success(
      locked
        ? "Bulan ini dibuka kembali — angka akan dihitung ulang live."
        : `${(result as { lockedCount?: number }).lockedCount ?? 0} agent dikunci untuk ${BULAN[month - 1]} ${year}.`
    );
    router.refresh();
  }

  return (
    <>
      <Button
        variant={locked ? "outline" : "default"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        {locked ? "Buka Kunci" : "Kunci Bulan Ini"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {locked ? "Buka kunci" : "Kunci"} {BULAN[month - 1]} {year}?
            </DialogTitle>
            <DialogDescription>
              {locked
                ? "Angka insentif periode ini akan kembali dihitung live dari data aplikasi terbaru, bukan angka yang sudah dibekukan."
                : "Angka insentif periode ini akan dibekukan persis seperti yang tampil sekarang. Kalau data aplikasi berubah setelahnya, angka yang terkunci TIDAK ikut berubah — sampai kamu buka kuncinya lagi."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={working}>
              Batal
            </Button>
            <Button onClick={handleConfirm} disabled={working}>
              {working && <Loader2 className="h-4 w-4 animate-spin" />}
              {locked ? "Ya, Buka Kunci" : "Ya, Kunci Sekarang"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
