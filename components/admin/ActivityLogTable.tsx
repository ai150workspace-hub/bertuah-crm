"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Download, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { HASIL_PANGGILAN, GRUP_URUT } from "@/lib/call-outcome/catalog";
import { exportActivityLogRows, type ActivityLogExportRow } from "@/app/actions/activity-log";

// Sama dengan batas di app/actions/activity-log.ts - dicek dulu di sini
// (dari totalCount yang sudah dihitung page.tsx) supaya kasus umum "terlalu
// banyak" tidak perlu bolak-balik ke server dulu baru ditolak.
const EXPORT_ROW_LIMIT = 5000;

export interface ActivityLogRow {
  id: string;
  tanggal: string;
  waktu: string;
  agentName: string;
  namaKonsumen: string;
  noHp: string;
  kendaraan: string;
  hasilKode: string | null;
  hasilLabel: string;
  catatan: string | null;
}

interface AgentOption {
  id: string;
  name: string;
}

export function ActivityLogTable({
  rows,
  agents,
  agentFilter,
  hasilFilter,
  hasilGroup,
  q,
  page,
  pageSize,
  totalCount,
  from,
  to,
}: {
  rows: ActivityLogRow[];
  agents: AgentOption[];
  agentFilter: string;
  hasilFilter: string;
  /** "wajib_catatan" kalau datang dari link "Lihat semua" di CatatanLapangan (dashboard). */
  hasilGroup: string;
  q: string;
  page: number;
  pageSize: number;
  totalCount: number;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [exporting, startExport] = useTransition();

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page"); // filter berubah -> balik ke halaman 1
    router.push(`${pathname}?${params.toString()}`);
  }

  function hrefForPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  }

  const agentLabel =
    agentFilter === "all" ? "Semua Agent" : (agents.find((a) => a.id === agentFilter)?.name ?? "Agent");
  const hasilLabel =
    hasilFilter === "all"
      ? "Semua Status"
      : (HASIL_PANGGILAN.find((h) => h.kode === hasilFilter)?.label ?? "Status");

  function handleExport() {
    if (totalCount === 0) {
      toast.error("Tidak ada data untuk diexport.");
      return;
    }
    if (totalCount > EXPORT_ROW_LIMIT) {
      toast.error("Silakan persempit filter tanggal, data terlalu banyak untuk export sekaligus.");
      return;
    }

    startExport(async () => {
      const result = await exportActivityLogRows({
        from,
        to,
        agent: agentFilter,
        hasil: hasilFilter,
        hasilGroup,
        q,
      });
      if (!result.success) {
        toast.error("Gagal export.", { description: result.error });
        return;
      }

      // xlsx (SheetJS) diimpor saat tombol diklik, bukan ikut bundle awal
      // halaman - library-nya cukup besar. Pola sama dengan
      // components/admin/agents-export-button.tsx.
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(result.rows satisfies ActivityLogExportRow[]),
        "Log Aktivitas"
      );
      XLSX.writeFile(wb, `Log_Aktivitas_${from}_sd_${to}.xlsx`);
      toast.success(`${result.rows.length} baris berhasil diexport.`);
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
          <Select value={agentFilter} onValueChange={(v) => apply({ agent: v ?? "all" })}>
            <SelectTrigger className="w-44">
              <SelectValue>{() => agentLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Agent</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={hasilFilter}
            onValueChange={(v) => apply({ hasil: v ?? "all", hasil_group: "" })}
          >
            <SelectTrigger className="w-56">
              <SelectValue>{() => hasilLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
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

          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
              apply({ q: input.value });
            }}
          >
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input name="q" defaultValue={q} placeholder="Cari nama / no HP..." className="pl-8 w-56" />
          </form>
        </div>

        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Excel
        </Button>
      </div>

      {hasilFilter === "all" && hasilGroup === "wajib_catatan" && (
        <div className="flex items-center gap-2 rounded-md border border-hot/30 bg-hot/5 px-3 py-1.5 text-xs text-hot">
          <span>Difilter ke 7 status &quot;Bicara Dengan Orangnya&quot; (dari Catatan Lapangan).</span>
          <button
            type="button"
            className="font-medium underline underline-offset-2 hover:no-underline"
            onClick={() => apply({ hasil_group: "" })}
          >
            Hapus filter
          </button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Menampilkan {rows.length} dari {totalCount} total aktivitas sesuai filter
      </p>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead>Nama Agen</TableHead>
              <TableHead>Nama Konsumen</TableHead>
              <TableHead>No HP</TableHead>
              <TableHead>Kendaraan</TableHead>
              <TableHead>Hasil Panggilan</TableHead>
              <TableHead>Catatan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{r.tanggal}</TableCell>
                <TableCell className="whitespace-nowrap">{r.waktu}</TableCell>
                <TableCell>{r.agentName}</TableCell>
                <TableCell className="font-medium">{r.namaKonsumen}</TableCell>
                <TableCell className="whitespace-nowrap">{r.noHp}</TableCell>
                <TableCell>{r.kendaraan}</TableCell>
                <TableCell>{r.hasilLabel}</TableCell>
                <TableCell className="max-w-64 truncate" title={r.catatan ?? ""}>
                  {r.catatan || <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Tidak ada aktivitas yang cocok filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalCount > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Halaman {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              nativeButton={false}
              render={
                <Link href={hrefForPage(Math.max(1, page - 1))}>
                  <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
                </Link>
              }
            />
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              nativeButton={false}
              render={
                <Link href={hrefForPage(Math.min(totalPages, page + 1))}>
                  Berikutnya <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
