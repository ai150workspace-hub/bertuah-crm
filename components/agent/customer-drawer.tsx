"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MessageCircle, Phone, Save } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/types";
import {
  CALL_STATUS_TREE,
  getLevel2Options,
  getLevel3Options,
  getLevel4Options,
  getUnprospectDetails,
  type Level1,
} from "@/lib/call-status-tree";
import { cn } from "@/lib/utils";

export function CustomerDrawer({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [level1, setLevel1] = useState<Level1 | "">("");
  const [level2, setLevel2] = useState("");
  const [level3, setLevel3] = useState("");
  const [level4, setLevel4] = useState("");
  const [unprospectDetail, setUnprospectDetail] = useState("");
  const [notes, setNotes] = useState("");

  if (!contact) return null;

  const level2Options = level1 ? getLevel2Options(level1) : [];
  const level3Options = level1 && level2 ? getLevel3Options(level1, level2) : [];
  const level4Options =
    level1 && level2 && level3 ? getLevel4Options(level1, level2, level3) : [];
  const needsUnprospectDetail = level4 === "Unprospect";
  const needsFollowUpDate = level4 === "Callback" || level4 === "Meeting";

  function resetForm() {
    setLevel1("");
    setLevel2("");
    setLevel3("");
    setLevel4("");
    setUnprospectDetail("");
    setNotes("");
  }

  function handleSave() {
    if (!level1 || !level2) {
      toast.error("Lengkapi minimal Level 1 dan Level 2 sebelum menyimpan.");
      return;
    }
    toast.success(`Call log untuk ${contact!.nama} tersimpan (mode demo).`, {
      description: "Belum tersambung ke database — data ini tidak persisten.",
    });
    resetForm();
    onOpenChange(false);
  }

  const waMessage = encodeURIComponent(
    `Assalamu'alaikum Bapak/Ibu ${contact.nama} 🙏\n\nSaya dari *Bertuah CRM* — solusi dana tunai jaminan BPKB kendaraan di Pekanbaru.\n\nBoleh saya bantu hitungkan simulasi untuk ${contact.jenisKendaraan.toLowerCase()} ${contact.merkTipe} (${contact.tahun}) milik Bapak/Ibu?\n\nTerima kasih 🙏`
  );
  const waHref = `https://wa.me/62${contact.noHp.replace(/\D/g, "").replace(/^0/, "")}?text=${waMessage}`;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contact.nama}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" /> {contact.noHp}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Informasi Kendaraan
            </h4>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">{contact.jenisKendaraan}</Badge>
              <Badge variant="outline">
                {contact.merkTipe} · {contact.tahun}
              </Badge>
              <Badge variant="outline">Pajak: {contact.statusPajak}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{contact.domisili}</p>
          </section>

          <Separator />

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Form Call Status
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Level 1</Label>
                <Select
                  value={level1}
                  onValueChange={(v) => {
                    setLevel1(v as Level1);
                    setLevel2("");
                    setLevel3("");
                    setLevel4("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(CALL_STATUS_TREE).map((k) => (
                      <SelectItem key={k} value={k}>
                        {CALL_STATUS_TREE[k as Level1].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Level 2</Label>
                <Select
                  value={level2}
                  onValueChange={(v) => {
                    setLevel2(v ?? "");
                    setLevel3("");
                    setLevel4("");
                  }}
                  disabled={!level1}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {level2Options.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className={cn("space-y-1.5", !level3Options.length && "opacity-40")}>
                <Label className="text-xs">Level 3</Label>
                <Select
                  value={level3}
                  onValueChange={(v) => {
                    setLevel3(v ?? "");
                    setLevel4("");
                  }}
                  disabled={!level3Options.length}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {level3Options.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className={cn("space-y-1.5", !level4Options.length && "opacity-40")}>
                <Label className="text-xs">Level 4</Label>
                <Select
                  value={level4}
                  onValueChange={(v) => setLevel4(v ?? "")}
                  disabled={!level4Options.length}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {level4Options.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {needsUnprospectDetail && (
              <div className="space-y-1.5">
                <Label className="text-xs">Detail Unprospect</Label>
                <Select
                  value={unprospectDetail}
                  onValueChange={(v) => setUnprospectDetail(v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih alasan" />
                  </SelectTrigger>
                  <SelectContent>
                    {getUnprospectDetails().map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsFollowUpDate && (
              <div className="space-y-1.5">
                <Label className="text-xs">Tanggal Follow-up</Label>
                <input
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
              </div>
            )}

            {(level4 === "Interest" || level4 === "Prospect") && (
              <div className="rounded-md border border-hot/30 bg-hot/5 px-3 py-2 text-xs text-hot">
                Hot lead — kirim simulasi via WhatsApp segera setelah menyimpan.
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Catatan</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan tambahan hasil percakapan..."
                rows={3}
              />
            </div>
          </section>
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            nativeButton={false}
            render={
              <a href={waHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> Kirim WA
              </a>
            }
          />
          <Button className="flex-1" onClick={handleSave}>
            <Save className="h-4 w-4" /> Simpan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
