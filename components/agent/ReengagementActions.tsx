"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { fillWaPlaceholders, type ScriptPlaceholderData } from "@/lib/script-placeholder";
import { normalisasiNomor } from "@/lib/telephony/phone";
import { markReengagementSent } from "@/app/actions/reengagement";
import type { ReengagementLead } from "@/lib/reengagement";

/**
 * "Kirim WA Re-engagement": preview pesan yang sudah terisi, agen buka
 * WhatsApp dan kirim MANUAL (bukan auto-send), lalu konfirmasi sendiri
 * kalau sudah terkirim - baru saat itu last_reengagement_sent_at dicatat.
 */
export function ReengagementActions({
  lead,
  templateText,
}: {
  lead: ReengagementLead;
  templateText: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [waOpened, setWaOpened] = useState(false);

  const data: ScriptPlaceholderData = {
    nama: lead.nama,
    kendaraan: [lead.jenisKendaraan, lead.merkTipe].filter(Boolean).join(" "),
    tahun: lead.tahun ?? 0,
    merk: lead.merkTipe ?? "",
  };
  const message = templateText ? fillWaPlaceholders(templateText, data) : "";
  const phoneE164 = normalisasiNomor(lead.noHp);
  const waHref = phoneE164 ? `https://wa.me/${phoneE164}?text=${encodeURIComponent(message)}` : undefined;

  async function handleConfirm() {
    setConfirming(true);
    const result = await markReengagementSent(lead.id);
    setConfirming(false);
    if (!result.success) {
      toast.error("Gagal mencatat.", { description: result.error });
      return;
    }
    toast.success(`${lead.nama} ditandai sudah dikirim ulang.`);
    setOpen(false);
    setWaOpened(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageCircle className="h-3.5 w-3.5" /> Kirim WA Re-engagement
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kirim WA Re-engagement — {lead.nama}</DialogTitle>
          <DialogDescription>
            Preview pesan di bawah, buka WhatsApp untuk kirim manual, lalu tandai selesai.
          </DialogDescription>
        </DialogHeader>

        <div className="whitespace-pre-line rounded-md border bg-muted/40 p-3 text-sm">
          {message || "Template belum tersedia — hubungi admin."}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            nativeButton={false}
            disabled={!waHref}
            render={
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWaOpened(true)}
              >
                <MessageCircle className="h-4 w-4" /> Buka WhatsApp
              </a>
            }
          />
          <Button onClick={handleConfirm} disabled={confirming || !waOpened}>
            <CheckCircle2 className="h-4 w-4" />
            {confirming ? "Menyimpan..." : "Sudah Kirim, Tandai Selesai"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
