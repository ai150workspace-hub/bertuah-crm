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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MessageCircle, Phone, Save } from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/types";
import {
  HASIL_PANGGILAN,
  SUB_ALASAN_TIDAK_LAYAK,
  GRUP_URUT,
  type KodeHasil,
  type KodeSubAlasan,
} from "@/lib/call-outcome/catalog";
import { infoHasil, validasiHasil, efekSamping } from "@/lib/call-outcome/derive";

export function CustomerDrawer({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kode, setKode] = useState<KodeHasil | "">("");
  const [subAlasan, setSubAlasan] = useState<KodeSubAlasan | "">("");
  const [tanggalFollowup, setTanggalFollowup] = useState("");
  const [simulasiNominal, setSimulasiNominal] = useState("");
  const [simulasiTenor, setSimulasiTenor] = useState("");
  const [notes, setNotes] = useState("");

  if (!contact) return null;

  const selected = kode ? infoHasil(kode) : null;
  const wajib = (selected?.wajib ?? []) as readonly string[];

  function resetForm() {
    setKode("");
    setSubAlasan("");
    setTanggalFollowup("");
    setSimulasiNominal("");
    setSimulasiTenor("");
    setNotes("");
  }

  function handleSave() {
    if (!kode) {
      toast.error("Pilih dulu hasil panggilannya.");
      return;
    }

    const validasi = validasiHasil({
      kode,
      subAlasan: subAlasan || null,
      tanggalFollowup: tanggalFollowup || null,
      simulasiNominal: simulasiNominal ? Number(simulasiNominal) : null,
      simulasiTenor: simulasiTenor ? Number(simulasiTenor) : null,
    });

    if (!validasi.valid) {
      toast.error(validasi.error[0], {
        description: validasi.error.slice(1).join(" ") || undefined,
      });
      return;
    }

    const efek = efekSamping({
      kode,
      subAlasan: subAlasan || null,
      tanggalFollowup: tanggalFollowup || null,
    });

    toast.success(
      `Call log untuk ${contact!.nama} tersimpan (mode demo).`,
      {
        description: `Status kontak -> ${efek.statusKontak}. Belum tersambung ke database — data ini tidak persisten.`,
      }
    );
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
              Hasil Panggilan
            </h4>

            <div className="space-y-1.5">
              <Label className="text-xs">Hasil</Label>
              <Select value={kode} onValueChange={(v) => setKode((v as KodeHasil) ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih hasil panggilan">
                    {(v: string | null) => (v ? infoHasil(v as KodeHasil).label : "Pilih hasil panggilan")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GRUP_URUT.map((grup) => (
                    <SelectGroup key={grup}>
                      <SelectLabel>{grup}</SelectLabel>
                      {HASIL_PANGGILAN.filter((h) => h.grup === grup).map((h) => (
                        <SelectItem key={h.kode} value={h.kode}>
                          {h.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <p className="text-xs text-muted-foreground">{selected.aksi}</p>
              )}
            </div>

            {wajib.includes("sub_alasan") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Alasan Tidak Lolos</Label>
                <Select
                  value={subAlasan}
                  onValueChange={(v) => setSubAlasan((v as KodeSubAlasan) ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih alasan">
                      {(v: string | null) =>
                        v
                          ? SUB_ALASAN_TIDAK_LAYAK.find((s) => s.kode === v)?.label
                          : "Pilih alasan"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_ALASAN_TIDAK_LAYAK.map((s) => (
                      <SelectItem key={s.kode} value={s.kode}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {wajib.includes("tanggal_followup") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Tanggal Follow-up</Label>
                <input
                  type="date"
                  value={tanggalFollowup}
                  onChange={(e) => setTanggalFollowup(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                />
              </div>
            )}

            {wajib.includes("simulasi") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nominal Simulasi (Rp)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="50000000"
                    value={simulasiNominal}
                    onChange={(e) => setSimulasiNominal(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tenor (bulan)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="24"
                    value={simulasiTenor}
                    onChange={(e) => setSimulasiTenor(e.target.value)}
                  />
                </div>
              </div>
            )}

            {kode === "MINAT" && (
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
