"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { infoHasil, validasiHasil } from "@/lib/call-outcome/derive";
import { saveCallLog, getPreviousCallHistory, type PreviousCallHistoryEntry } from "@/app/actions/call-log";
import { telUri, normalisasiNomor } from "@/lib/telephony/phone";
import type { ProviderCapabilities } from "@/lib/telephony/types";
import { ScriptSidebar } from "./ScriptSidebar";
import type { ScriptContentRow } from "@/lib/scripts";
import { fillWaPlaceholders, type ScriptPlaceholderData } from "@/lib/script-placeholder";
import { cn } from "@/lib/utils";

const RUPIAH_PLAIN = new Intl.NumberFormat("id-ID");

export function CustomerDrawer({
  contact,
  open,
  onOpenChange,
  capabilities,
  scripts,
  agentId,
  agentCreatedAt,
  initialFollowupTemplate,
}: {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capabilities: ProviderCapabilities;
  /** Konten panduan script - kalau tidak dikirim, sidebar panduan tidak ditampilkan. */
  scripts?: ScriptContentRow[];
  agentId?: string;
  agentCreatedAt?: string;
  /** Teks mentah template WA "initial_followup" (belum diisi placeholder) - lihat lib/wa-templates.ts. */
  initialFollowupTemplate?: string | null;
}) {
  const router = useRouter();
  const [kode, setKode] = useState<KodeHasil | "">("");
  const [subAlasan, setSubAlasan] = useState<KodeSubAlasan | "">("");
  const [tanggalFollowup, setTanggalFollowup] = useState("");
  const [simulasiNominal, setSimulasiNominal] = useState("");
  const [simulasiTenor, setSimulasiTenor] = useState("");
  const [simulasiAngsuran, setSimulasiAngsuran] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PreviousCallHistoryEntry[]>([]);

  const contactId = contact?.id;
  const hasPreviousCalls = contact?.hasPreviousCalls;
  useEffect(() => {
    if (open && contactId && hasPreviousCalls) {
      getPreviousCallHistory(contactId).then(setHistory);
    }
  }, [open, contactId, hasPreviousCalls]);

  if (!contact) return null;

  const selected = kode ? infoHasil(kode) : null;
  const wajib = (selected?.wajib ?? []) as readonly string[];

  function resetForm() {
    setKode("");
    setSubAlasan("");
    setTanggalFollowup("");
    setSimulasiNominal("");
    setSimulasiTenor("");
    setSimulasiAngsuran("");
    setNotes("");
    setHistory([]);
  }

  async function handleSave() {
    if (!kode) {
      toast.error("Pilih dulu hasil panggilannya.");
      return;
    }

    // Validasi klien dulu supaya pesan error cepat muncul — server tetap
    // memvalidasi ulang (lihat app/actions/call-log.ts), ini bukan
    // pengganti validasi server.
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

    setSaving(true);
    const result = await saveCallLog({
      contactId: contact!.id,
      kode,
      subAlasan: subAlasan || null,
      tanggalFollowup: tanggalFollowup || null,
      simulasiNominal: simulasiNominal ? Number(simulasiNominal) : null,
      simulasiTenor: simulasiTenor ? Number(simulasiTenor) : null,
      simulasiAngsuran: simulasiAngsuran ? Number(simulasiAngsuran) : null,
      notes: notes || null,
    });
    setSaving(false);

    if (!result.success) {
      toast.error("Gagal menyimpan call log.", { description: result.error });
      return;
    }

    toast.success(`Call log untuk ${contact!.nama} tersimpan.`, {
      description: `Status kontak -> ${result.statusKontak}.`,
    });
    resetForm();
    onOpenChange(false);
    router.refresh();
  }

  const phoneE164 = normalisasiNomor(contact.noHp);

  const kendaraanText = [contact.jenisKendaraan, contact.merkTipe].filter(Boolean).join(" ");
  const placeholderData: ScriptPlaceholderData = {
    nama: contact.nama,
    kendaraan: kendaraanText,
    tahun: contact.tahun,
    merk: contact.merkTipe || "",
    jumlah: simulasiNominal ? RUPIAH_PLAIN.format(Number(simulasiNominal)) : undefined,
    cicilan: simulasiAngsuran ? RUPIAH_PLAIN.format(Number(simulasiAngsuran)) : undefined,
    tenor: simulasiTenor ? Number(simulasiTenor) : undefined,
  };

  // Simulasi (nominal + tenor) sudah diisi -> pakai template "initial_followup"
  // dari database (lihat lib/wa-templates.ts). Belum diisi -> tetap pakai
  // pembuka generik seperti sebelumnya, karena 4 template WA yang ada semuanya
  // situasional (butuh data simulasi/jadwal) - tidak ada yang cocok untuk
  // "ajak hitung simulasi" sebelum simulasinya ada.
  const hasSimulasi = Boolean(simulasiNominal && simulasiTenor);
  const waMessage =
    hasSimulasi && initialFollowupTemplate
      ? fillWaPlaceholders(initialFollowupTemplate, placeholderData)
      : `Assalamu'alaikum Bapak/Ibu ${contact.nama} 🙏\n\nSaya dari *Mitra Bertuah* — solusi dana tunai jaminan BPKB kendaraan di Pekanbaru.\n\nBoleh saya bantu hitungkan simulasi untuk ${contact.jenisKendaraan.toLowerCase()} ${contact.merkTipe} (${contact.tahun}) milik Bapak/Ibu?\n\nTerima kasih 🙏`;
  const waHref = phoneE164
    ? `https://wa.me/${phoneE164}?text=${encodeURIComponent(waMessage)}`
    : undefined;
  // capabilities.clickToCall true (PBX) would originate the call from the
  // CRM instead of opening tel: — belum aktif, lihat docs/TELEPHONY.md.
  const dialHref = phoneE164 ? telUri(phoneE164) : undefined;
  const hasScriptSidebar = Boolean(scripts && agentId && agentCreatedAt);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <SheetContent
        className={cn(
          // Di layar sempit (<sm) form utama & panel script ditumpuk
          // vertikal (bukan disejajarkan) - panel script lebar tetap
          // 320px kalau dipaksa sejajar di layar sempit akan mendesak
          // keluar form utama (telepon, status call, dst). Scroll jadi
          // satu kolom di sini (overflow-y-auto), baru dipecah jadi 2
          // kolom dengan scroll independen mulai breakpoint sm.
          "w-full overflow-y-auto sm:overflow-hidden",
          // SheetContent bawaan sudah punya kelas
          // "data-[side=right]:sm:max-w-sm" - twMerge tidak menganggap itu
          // "grup kelas" yang sama dengan sm:max-w-3xl polos (beda variant
          // stack), jadi keduanya nempel dan yang bawaan menang di CSS.
          // Override harus pakai variant persis sama supaya twMerge benar
          // menggantikannya.
          hasScriptSidebar ? "data-[side=right]:sm:max-w-3xl" : "data-[side=right]:sm:max-w-lg"
        )}
      >
        <div className="flex flex-col sm:h-full sm:min-h-0 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col sm:overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contact.nama}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> {contact.noHp}
            </span>
            {dialHref && (
              <a
                href={dialHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Telepon
              </a>
            )}
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

          {contact.hasPreviousCalls && (
            <>
              <Separator />
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Riwayat Sebelumnya
                </h4>
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Memuat riwayat...</p>
                ) : (
                  <div className="space-y-2.5">
                    {history.map((h, i) => (
                      <div key={i} className="border-l-2 border-indigo-500/30 pl-2.5 text-sm">
                        <div className="text-xs text-muted-foreground">
                          {new Date(h.timestamp).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {h.agentFirstName}
                        </div>
                        <div className="font-medium">{h.hasilLabel}</div>
                        {h.notes && (
                          <div className="text-xs text-muted-foreground">&ldquo;{h.notes}&rdquo;</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

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
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Cicilan/bulan (Rp) — opsional</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="2500000"
                    value={simulasiAngsuran}
                    onChange={(e) => setSimulasiAngsuran(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Isi manual kalau mau disebutkan ke customer — sistem tidak menghitung otomatis (rate bunga tidak difixed).
                  </p>
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

            {!capabilities.autoRecording && (
              <p className="text-xs text-muted-foreground">
                Rekaman menyusul dari unggahan harian — pastikan HP kamu merekam
                panggilan ini.
              </p>
            )}
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
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </SheetFooter>
        </div>

        {hasScriptSidebar && (
          <div className="shrink-0 border-t px-4 py-4 sm:overflow-y-auto sm:border-t-0 sm:pr-4 sm:pl-0">
            <ScriptSidebar
              scripts={scripts!}
              agentId={agentId!}
              agentCreatedAt={agentCreatedAt!}
              placeholderData={placeholderData}
            />
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
