"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { advanceApplicationStatus } from "@/app/actions/applications";
import { NEXT_ALLOWED_STATUS, type NextApplicationStatus } from "@/lib/applications";

const todayStr = () => new Date().toISOString().slice(0, 10);

export function UpdateApplicationStatusDialog({
  applicationId,
  contactName,
  currentStatus,
  open,
  onOpenChange,
}: {
  applicationId: string;
  contactName: string;
  currentStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const options = NEXT_ALLOWED_STATUS[currentStatus] ?? [];
  const [nextStatus, setNextStatus] = useState<NextApplicationStatus | "">(options[0] ?? "");
  const [dateValue, setDateValue] = useState(todayStr());
  const [nominalPencairan, setNominalPencairan] = useState("");
  const [angsuranPerBulan, setAngsuranPerBulan] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  function resetAndClose() {
    setNextStatus(options[0] ?? "");
    setDateValue(todayStr());
    setNominalPencairan("");
    setAngsuranPerBulan("");
    setRejectionReason("");
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!nextStatus) {
      toast.error("Pilih status berikutnya.");
      return;
    }
    setSaving(true);
    const result = await advanceApplicationStatus({
      applicationId,
      nextStatus,
      dateValue,
      nominalPencairan: nominalPencairan ? Number(nominalPencairan) : null,
      angsuranPerBulan: angsuranPerBulan ? Number(angsuranPerBulan) : null,
      rejectionReason: rejectionReason || null,
    });
    setSaving(false);

    if (!result.success) {
      toast.error("Gagal update status.", { description: result.error });
      return;
    }
    toast.success(`Status aplikasi ${contactName} -> ${nextStatus}.`);
    resetAndClose();
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : resetAndClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Status — {contactName}</DialogTitle>
          <DialogDescription>Status saat ini: {currentStatus}</DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aplikasi ini sudah di status final, tidak bisa diubah lagi.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Status Berikutnya</Label>
              <Select
                value={nextStatus}
                onValueChange={(v) => setNextStatus((v as NextApplicationStatus) ?? options[0])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{() => nextStatus || "Pilih status..."}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {nextStatus !== "Rejected" && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Tanggal{" "}
                  {nextStatus === "Sent to Leasing"
                    ? "Diajukan"
                    : nextStatus === "Survey"
                      ? "Survey"
                      : nextStatus === "Approved"
                        ? "Approved"
                        : "Cair"}
                </Label>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
              </div>
            )}

            {nextStatus === "Disbursed" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nominal Pencairan</Label>
                  <RupiahInput
                    value={nominalPencairan}
                    onChange={setNominalPencairan}
                    placeholder="50.000.000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Angsuran/bulan (opsional)</Label>
                  <RupiahInput value={angsuranPerBulan} onChange={setAngsuranPerBulan} />
                </div>
              </div>
            )}

            {nextStatus === "Approved" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Angsuran/bulan (opsional)</Label>
                <RupiahInput value={angsuranPerBulan} onChange={setAngsuranPerBulan} />
              </div>
            )}

            {nextStatus === "Rejected" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Alasan Penolakan</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={resetAndClose} disabled={saving}>
            Batal
          </Button>
          {options.length > 0 && (
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
