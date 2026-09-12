"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Phone, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import type { Contact, StatusCall } from "@/types";
import { STATUS_CALL_COLORS } from "@/lib/status-colors";
import { claimLeads } from "@/app/actions/leads";
import { CustomerDrawer } from "./customer-drawer";
import type { ScriptContentRow } from "@/lib/scripts";
import type { ProviderCapabilities } from "@/lib/telephony/types";
import { todayWib, wibDateFromIso, formatDateID } from "@/lib/wib-date";

const DEFAULT_CLAIM_BATCH_SIZE = 50;
const MAX_CLAIM_BATCH_SIZE = 50;
const FILTERABLE_STATUSES: StatusCall[] = ["Uncalled", "In Progress", "Warm", "Hot Lead"];
export type SortKey = "updated" | "nama" | "status" | "followup";

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Last Updated",
  nama: "Nama",
  status: "Status",
  followup: "Jadwal Follow-up",
};

function followUpInfo(nextFollowUpAt?: string): { label: string; className: string } | null {
  if (!nextFollowUpAt) return null;
  const dueDay = wibDateFromIso(nextFollowUpAt);
  const today = todayWib();
  if (dueDay < today) {
    return { label: `Terlambat · ${formatDateID(dueDay)}`, className: "text-destructive font-medium" };
  }
  if (dueDay === today) {
    return { label: "Hari ini", className: "text-warning-foreground font-medium" };
  }
  return { label: formatDateID(dueDay), className: "text-muted-foreground" };
}

export interface ActiveSlotsInfo {
  activeCount: number;
  kapasitas: number;
  available: number;
  isFull: boolean;
}

/** Sembunyikan sebagian no HP di daftar - nomor penuh baru tampil di drawer Panggil. */
function maskPhone(phone: string): string {
  if (phone.length <= 7) return phone;
  const prefix = phone.slice(0, 4);
  const suffix = phone.slice(-3);
  const dots = "•".repeat(phone.length - prefix.length - suffix.length);
  return `${prefix}${dots}${suffix}`;
}

function capacityBarColor(activeCount: number, kapasitas: number): string {
  if (kapasitas <= 0) return "bg-muted-foreground";
  if (activeCount >= kapasitas * 0.8) return "bg-destructive";
  if (activeCount >= kapasitas * 0.5) return "bg-warning";
  return "bg-success";
}

/**
 * Dipakai di dua tempat:
 * - compact=true (preview di Dashboard) - `contacts` array kecil yang sudah
 *   dibatasi caller, search difilter lokal di browser (instan, tanpa filter/
 *   sort/pagination UI).
 * - compact=false (halaman penuh /agent/queue) - `contacts` SUDAH difilter,
 *   diurutkan, dan dipotong per halaman DI SERVER (q/statusFilter/sortKey/
 *   page adalah state URL, bukan state lokal) - lihat
 *   app/(dashboard)/agent/queue/page.tsx. Component ini TIDAK menyaring/
 *   mengurutkan ulang `contacts` untuk mode ini - apa yang diterima dari
 *   props itulah yang ditampilkan apa adanya. Sengaja begini (bukan fetch-
 *   semua-lalu-filter-di-client) supaya tidak ada batas total kontak yang
 *   bisa "kepotong" seperti bug sebelumnya - berapa pun besar riwayat
 *   kontak seorang agen, cuma 1 halaman yang pernah ditarik sekaligus.
 */
export function QueueTable({
  contacts,
  capabilities,
  activeSlots,
  agentStatus,
  compact = false,
  totalCount,
  q = "",
  statusFilter = "all",
  sortKey = "updated",
  page = 1,
  pageSize = 25,
  scripts,
  agentId,
  agentCreatedAt,
  initialFollowupTemplate,
}: {
  contacts: Contact[];
  capabilities: ProviderCapabilities;
  activeSlots?: ActiveSlotsInfo | null;
  agentStatus?: "active" | "pause" | "inactive";
  compact?: boolean;
  /** Total lead sesungguhnya sesuai filter aktif - beda dari contacts.length kalau `contacts` cuma cuplikan (mis. preview di Dashboard, atau 1 halaman dari server). Default contacts.length. */
  totalCount?: number;
  /** Full mode saja (state URL, lihat page.tsx) - diabaikan kalau compact. */
  q?: string;
  statusFilter?: string;
  sortKey?: SortKey;
  page?: number;
  pageSize?: number;
  /** Diteruskan ke CustomerDrawer untuk panel panduan script - lihat components/agent/ScriptSidebar.tsx. */
  scripts?: ScriptContentRow[];
  agentId?: string;
  agentCreatedAt?: string;
  initialFollowupTemplate?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Search lokal - CUMA dipakai mode compact (filter instan di atas array
  // kecil yang sudah diberi caller). Mode full pakai form submit -> URL
  // (lihat `apply()` di bawah), sama seperti ContactsFilterBar/
  // ActivityLogTable, supaya pencarian benar-benar jalan di server (bukan
  // cuma mencari di dalam 1 halaman yang kebetulan sedang tampil).
  const [compactSearch, setCompactSearch] = useState("");

  const [selected, setSelected] = useState<Contact | null>(null);
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [batchSize, setBatchSize] = useState(DEFAULT_CLAIM_BATCH_SIZE);
  const [lastClaimResult, setLastClaimResult] = useState<string | null>(null);

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in next)) params.delete("page"); // filter berubah -> balik ke halaman 1
    router.push(`${pathname}?${params.toString()}`);
  }

  function hrefForPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  }

  const pageItems = compact
    ? contacts.filter((c) =>
        `${c.nama} ${c.noHp}`.toLowerCase().includes(compactSearch.toLowerCase())
      )
    : contacts;

  const effectiveTotal = totalCount ?? contacts.length;
  const totalPages = compact ? 1 : Math.max(1, Math.ceil(effectiveTotal / pageSize));

  async function handleClaim() {
    setClaiming(true);
    const result = await claimLeads(batchSize);
    setClaiming(false);

    if (!result.success) {
      toast.error("Gagal mengambil data baru.", { description: result.error });
      setLastClaimResult(null);
      return;
    }
    if (!result.claimed) {
      toast.info("Tidak ada lead baru yang tersedia di pool saat ini.");
      setLastClaimResult(null);
      return;
    }
    toast.success(`${result.claimed} lead baru diambil.`);
    // Breakdown per kategori (recycled warm/in-progress/fresh) belum
    // tersedia dari RPC - assign_contacts_to_agent cuma return total
    // assigned_count, bukan rincian per prioritas. Kalau nanti perlu
    // rincian granular, RPC-nya perlu ditambah kolom return.
    setLastClaimResult(`Dapat: ${result.claimed} kontak baru.`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Antrean Saya</h3>
          <p className="text-sm text-muted-foreground">
            {effectiveTotal} lead dalam antrean kamu
          </p>
          {activeSlots && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full transition-all",
                    capacityBarColor(activeSlots.activeCount, activeSlots.kapasitas)
                  )}
                  style={{
                    width: `${Math.min(100, (activeSlots.activeCount / Math.max(1, activeSlots.kapasitas)) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {activeSlots.activeCount} aktif / {activeSlots.kapasitas} kapasitas
              </span>
            </div>
          )}
          {activeSlots && (
            <p className="text-[11px] text-muted-foreground/70">
              Uncalled + In Progress + Warm dihitung · Invalid &amp; Hot Lead tidak
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {compact ? (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama / no HP..."
                value={compactSearch}
                onChange={(e) => setCompactSearch(e.target.value)}
                className="pl-8 w-full sm:w-56"
              />
            </div>
          ) : (
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
                apply({ q: input.value });
              }}
            >
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="Cari nama / no HP..."
                className="pl-8 w-full sm:w-56"
              />
            </form>
          )}

          {!compact && (
            <>
              <Select
                value={statusFilter}
                onValueChange={(v) => apply({ status: v && v !== "all" ? v : "" })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {(v: string | null) => (v === "all" || !v ? "Semua Status" : v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  {FILTERABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={sortKey}
                onValueChange={(v) => apply({ sort: (v as SortKey) ?? "updated" })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {(v: string | null) => `Urut: ${SORT_LABEL[(v as SortKey) ?? "updated"]}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      Urut: {SORT_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          <Input
            type="number"
            min={1}
            max={MAX_CLAIM_BATCH_SIZE}
            value={batchSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) {
                setBatchSize(Math.min(MAX_CLAIM_BATCH_SIZE, Math.max(1, n)));
              }
            }}
            className="w-16"
            title="Jumlah data yang diambil per klik (maks 50)"
            aria-label="Jumlah data yang diambil"
          />
          <span
            title={
              agentStatus === "pause"
                ? "Akunmu sedang di-pause. Hubungi admin untuk mengaktifkan kembali."
                : activeSlots?.isFull
                  ? `Antrean aktif penuh (${activeSlots.activeCount}/${activeSlots.kapasitas}). Selesaikan dulu.`
                  : undefined
            }
          >
            <Button
              onClick={handleClaim}
              disabled={claiming || activeSlots?.isFull || agentStatus === "pause"}
            >
              <Plus className="h-4 w-4" />
              {claiming ? "Mengambil..." : "Ambil Data Baru"}
            </Button>
          </span>
        </div>
      </div>

      {lastClaimResult && (
        <p className="text-xs text-muted-foreground">{lastClaimResult}</p>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Kendaraan</TableHead>
              <TableHead className="hidden md:table-cell">Area</TableHead>
              <TableHead>Status Call</TableHead>
              <TableHead className="hidden sm:table-cell">Last Call</TableHead>
              <TableHead>Jadwal Follow-up</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((c) => {
              const invalid = c.statusCall === "Invalid";
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "font-medium",
                          invalid && "line-through text-muted-foreground"
                        )}
                      >
                        {c.nama}
                      </span>
                      {c.hasPreviousCalls && (
                        <Badge
                          variant="outline"
                          className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400 px-1.5 py-0 text-[10px] font-normal"
                          title="Pernah dihubungi agen lain sebelumnya"
                        >
                          🔄 Recycled
                        </Badge>
                      )}
                    </div>
                    <div
                      className={cn(
                        "text-xs text-muted-foreground",
                        invalid && "line-through"
                      )}
                      title="Nomor lengkap tampil saat buka Panggil"
                    >
                      {maskPhone(c.noHp)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{c.merkTipe}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.jenisKendaraan} · {c.tahun}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {c.domisili}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_CALL_COLORS[c.statusCall]} variant="outline">
                      {c.statusCall}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {c.lastContactedAt
                      ? formatDistanceToNow(new Date(c.lastContactedAt), {
                          addSuffix: true,
                          locale: idLocale,
                        })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const fu = followUpInfo(c.nextFollowUpAt);
                      return fu ? (
                        <span className={cn("text-sm", fu.className)}>{fu.label}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <span title={invalid ? "Nomor tidak valid" : undefined}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={invalid}
                        onClick={() => {
                          setSelected(c);
                          setOpen(true);
                        }}
                      >
                        <Phone className="h-3.5 w-3.5" /> Panggil
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Tidak ada lead yang cocok.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!compact && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Halaman {page} dari {totalPages}
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

      <CustomerDrawer
        contact={selected}
        open={open}
        onOpenChange={setOpen}
        capabilities={capabilities}
        scripts={scripts}
        agentId={agentId}
        agentCreatedAt={agentCreatedAt}
        initialFollowupTemplate={initialFollowupTemplate}
      />
    </div>
  );
}
