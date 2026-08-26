"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { createApplication } from "@/app/actions/applications";

export interface EligibleContact {
  id: string;
  nama: string;
  noHp: string;
}

export interface LeasingPartnerOption {
  id: string;
  name: string;
}

export function CreateApplicationDialog({
  contacts,
  leasingPartners,
}: {
  contacts: EligibleContact[];
  leasingPartners: LeasingPartnerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [leasingPartner, setLeasingPartner] = useState("");
  const [nominalPengajuan, setNominalPengajuan] = useState("");
  const [tenorBulan, setTenorBulan] = useState("");
  const [notes, setNotes] = useState("");

  const selectedContact = contacts.find((c) => c.id === contactId);

  function resetForm() {
    setContactId("");
    setLeasingPartner("");
    setNominalPengajuan("");
    setTenorBulan("");
    setNotes("");
  }

  async function handleSubmit() {
    if (!contactId) {
      toast.error("Pilih kontak Hot Lead dulu.");
      return;
    }
    setSaving(true);
    const result = await createApplication({
      contactId,
      leasingPartner,
      nominalPengajuan: Number(nominalPengajuan),
      tenorBulan: tenorBulan ? Number(tenorBulan) : null,
      notes: notes || null,
    });
    setSaving(false);

    if (!result.success) {
      toast.error("Gagal mengajukan aplikasi.", { description: result.error });
      return;
    }
    toast.success(`Aplikasi untuk ${selectedContact?.nama ?? "kontak"} berhasil dibuat (Draft).`);
    resetForm();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={contacts.length === 0}>
        <Plus className="h-4 w-4" /> Ajukan Aplikasi Baru
      </Button>
      {contacts.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Belum ada kontak Hot Lead yang bisa diajukan.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajukan Aplikasi Baru</DialogTitle>
            <DialogDescription>
              Hanya kontak berstatus Hot Lead yang bisa diajukan. Aplikasi dibuat dengan status
              Draft, lalu bisa kamu update progresnya.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Kontak (Hot Lead)</Label>
              <Select value={contactId} onValueChange={(v) => setContactId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {() =>
                      selectedContact ? `${selectedContact.nama} — ${selectedContact.noHp}` : "Pilih kontak..."
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nama} — {c.noHp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Leasing Partner</Label>
              <Select value={leasingPartner} onValueChange={(v) => setLeasingPartner(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => leasingPartner || "Pilih leasing partner..."}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {leasingPartners.map((lp) => (
                    <SelectItem key={lp.id} value={lp.name}>
                      {lp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {leasingPartners.length === 0 && (
                <p className="text-[11px] text-destructive">
                  Belum ada leasing partner aktif — hubungi admin.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nominal Pengajuan</Label>
                <RupiahInput
                  value={nominalPengajuan}
                  onChange={setNominalPengajuan}
                  placeholder="50.000.000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tenor (bulan)</Label>
                <Input
                  type="number"
                  min="1"
                  value={tenorBulan}
                  onChange={(e) => setTenorBulan(e.target.value)}
                  placeholder="24"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Catatan (opsional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan sebagai Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
