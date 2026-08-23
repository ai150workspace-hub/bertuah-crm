"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  UploadCloud,
  FileDown,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  validateImportRows,
  commitImport,
  type RawImportRow,
  type ValidateImportResult,
  type ValidatedRow,
  type CommitImportResult,
  type AgentCapacityInfo,
} from "@/app/actions/import";

const TEMPLATE_CSV =
  "nama,no_hp,jenis_kendaraan,merk_tipe,tahun,domisili,catatan\n" +
  "Contoh Nama,081234567890,Mobil,Honda CRV,2011,Pekanbaru,Contoh catatan\n";

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_import_kontak.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getField(rec: Record<string, unknown>, key: string): string {
  const found = Object.keys(rec).find((k) => k.trim().toLowerCase() === key);
  return found ? String(rec[found] ?? "").trim() : "";
}

function hasColumn(rec: Record<string, unknown>, key: string): boolean {
  return Object.keys(rec).some((k) => k.trim().toLowerCase() === key);
}

function mapRow(rec: Record<string, unknown>): RawImportRow {
  // Beberapa template yang beredar menamai kolom Mobil/Motor sebagai
  // "tipe_kendaraan" dan menaruh merk/model di "jenis_kendaraan" - kebalikan
  // dari nama kolom di database. Kalau "tipe_kendaraan" ada di file, anggap
  // itu yang dipakai untuk Mobil/Motor, dan "jenis_kendaraan" jadi merk/tipe -
  // supaya tidak perlu rename manual di spreadsheet.
  const usesTipeKendaraanAlias = hasColumn(rec, "tipe_kendaraan");

  return {
    nama: getField(rec, "nama"),
    noHp: getField(rec, "no_hp"),
    jenisKendaraan: usesTipeKendaraanAlias
      ? getField(rec, "tipe_kendaraan")
      : getField(rec, "jenis_kendaraan"),
    merkTipe: usesTipeKendaraanAlias
      ? getField(rec, "jenis_kendaraan")
      : getField(rec, "merk_tipe"),
    tahun: getField(rec, "tahun"),
    domisili: getField(rec, "domisili"),
    catatan: getField(rec, "catatan"),
  };
}

async function parseFile(file: File): Promise<RawImportRow[]> {
  const isCsv = /\.csv$/i.test(file.name);

  if (isCsv) {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data.map(mapRow)),
        error: (err) => reject(err),
      });
    });
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });
  return rows.map(mapRow);
}

const STATUS_META: Record<
  ValidatedRow["status"],
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  valid: { label: "Valid", icon: CheckCircle2, className: "text-success border-success/30 bg-success/10" },
  duplicate: {
    label: "Duplikat",
    icon: AlertTriangle,
    className: "text-warning-foreground border-warning/30 bg-warning/10",
  },
  invalid: {
    label: "Format salah",
    icon: XCircle,
    className: "text-destructive border-destructive/30 bg-destructive/10",
  },
};

type Mode = "auto" | "manual" | "unassigned";

export function ImportWizard({ agents }: { agents: AgentCapacityInfo[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [validated, setValidated] = useState<ValidateImportResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [mode, setMode] = useState<Mode>("auto");
  const [manualAgentId, setManualAgentId] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitImportResult | null>(null);

  async function handleFile(file: File) {
    setParsing(true);
    setValidated(null);
    setResult(null);
    try {
      const rows = await parseFile(file);
      if (rows.length === 0) {
        toast.error("File kosong atau format kolom tidak terbaca.");
        setParsing(false);
        return;
      }
      setFilename(file.name);
      const res = await validateImportRows(rows);
      setValidated(res);
    } catch (err) {
      toast.error("Gagal membaca file.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setParsing(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const importableCount = validated
    ? validated.summary.valid + (skipDuplicates ? 0 : validated.summary.duplicate)
    : 0;

  const manualAgent = agents.find((a) => a.agentId === manualAgentId);
  const manualOverCapacity =
    manualAgent && importableCount > Math.max(0, manualAgent.capacity - manualAgent.used);

  async function handleCommit() {
    if (!validated || !filename) return;
    if (mode === "manual" && !manualAgentId) {
      toast.error("Pilih agent tujuan dulu.");
      return;
    }
    setCommitting(true);
    const res = await commitImport({
      filename,
      rows: validated.rows,
      skipDuplicates,
      mode,
      manualAgentId: mode === "manual" ? manualAgentId : undefined,
    });
    setCommitting(false);
    if (!res.success) {
      toast.error("Import gagal.", { description: res.error });
      return;
    }
    setResult(res);
    toast.success(`${res.imported} kontak berhasil diimpor.`);
    router.refresh();
  }

  function reset() {
    setFilename(null);
    setValidated(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Upload Data</CardTitle>
          <CardDescription>Format .csv atau .xlsx, kolom sesuai template.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <FileDown className="h-4 w-4" /> Download Template CSV
            </Button>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-input hover:bg-muted/40"
            )}
          >
            {parsing ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <UploadCloud className="h-6 w-6 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {filename ?? "Tarik file ke sini atau klik untuk pilih"}
            </p>
            <p className="text-xs text-muted-foreground">.csv atau .xlsx</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {validated && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4" /> Preview &amp; Validasi
            </CardTitle>
            <CardDescription>
              {validated.rows.length} baris terbaca — 5 baris pertama ditampilkan di bawah.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={STATUS_META.valid.className}>
                {validated.summary.valid} Valid
              </Badge>
              <Badge variant="outline" className={STATUS_META.duplicate.className}>
                {validated.summary.duplicate} Duplikat
              </Badge>
              <Badge variant="outline" className={STATUS_META.invalid.className}>
                {validated.summary.invalid} Format salah
              </Badge>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>No. HP</TableHead>
                    <TableHead>Kendaraan</TableHead>
                    <TableHead>Domisili</TableHead>
                    <TableHead>Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validated.rows.slice(0, 5).map((r) => {
                    const meta = STATUS_META[r.status];
                    const Icon = meta.icon;
                    return (
                      <TableRow key={r.index}>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1", meta.className)}>
                            <Icon className="h-3 w-3" /> {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.nama || "—"}</TableCell>
                        <TableCell>{r.noHpNormalized ?? (r.noHpRaw || "—")}</TableCell>
                        <TableCell>
                          {r.jenisKendaraan ?? "—"}
                          {r.merkTipe && ` · ${r.merkTipe}`}
                          {r.tahun ? ` (${r.tahun})` : ""}
                        </TableCell>
                        <TableCell>{r.domisili || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.reason ?? ""}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Lewati baris duplikat (jangan import)
            </label>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Mode Distribusi</h4>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { key: "auto", title: "Auto Round Robin", desc: "Isi agent paling kosong dulu" },
                    { key: "manual", title: "Manual Assign", desc: "Pilih satu agent tujuan" },
                    { key: "unassigned", title: "Unassigned Pool", desc: "Tidak di-assign siapa pun" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMode(opt.key)}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-colors",
                      mode === opt.key
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-muted/40"
                    )}
                  >
                    <div className="font-medium">{opt.title}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {mode === "manual" && (
                <div className="space-y-1.5">
                  <Select
                    value={manualAgentId}
                    onValueChange={(v) => setManualAgentId(v ?? "")}
                  >
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue placeholder="Pilih agent tujuan" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((a) => (
                        <SelectItem key={a.agentId} value={a.agentId}>
                          {a.agentName} ({a.used}/{a.capacity} terisi)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {manualAgent && (
                    <p className="text-xs text-muted-foreground">
                      Sisa kapasitas {manualAgent.agentName}:{" "}
                      {Math.max(0, manualAgent.capacity - manualAgent.used)} slot.
                    </p>
                  )}
                  {manualOverCapacity && (
                    <p className="text-xs text-warning-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Jumlah data ({importableCount}) melebihi sisa kapasitas agent ini — tetap
                      bisa dilanjutkan.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={handleCommit} disabled={committing || importableCount === 0}>
                {committing && <Loader2 className="h-4 w-4 animate-spin" />}
                {committing ? "Mengimpor..." : `Import ${importableCount} Kontak`}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={committing}>
                Batal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result?.success && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hasil Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-semibold text-success">{result.imported}</div>
                <div className="text-xs text-muted-foreground">Berhasil</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-semibold text-warning-foreground">
                  {result.duplicateSkipped}
                </div>
                <div className="text-xs text-muted-foreground">Duplikat di-skip</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-semibold text-destructive">
                  {result.errorCount}
                </div>
                <div className="text-xs text-muted-foreground">Error</div>
              </div>
            </div>

            {result.importedRows && result.importedRows.length > 0 && (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>No. HP</TableHead>
                      <TableHead>Kendaraan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.importedRows.map((r) => (
                      <TableRow key={r.index}>
                        <TableCell>{r.nama}</TableCell>
                        <TableCell>{r.noHpNormalized}</TableCell>
                        <TableCell>
                          {r.jenisKendaraan}
                          {r.merkTipe && ` · ${r.merkTipe}`}
                          {r.tahun ? ` (${r.tahun})` : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={reset}>
              Import File Lain
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
