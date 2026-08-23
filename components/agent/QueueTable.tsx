"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import type { ProviderCapabilities } from "@/lib/telephony/types";
import { todayWib, wibDateFromIso, formatDateID } from "@/lib/wib-date";

const FULL_PAGE_SIZE = 25;
const FILTERABLE_STATUSES: StatusCall[] = ["Uncalled", "In Progress", "Warm", "Hot Lead"];
type SortKey = "updated" | "nama" | "status" | "followup";

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

/**
 * Dipakai di dua tempat: versi ringkas di Dashboard (compact) dan versi
 * halaman penuh di /agent/queue (filter + sort + pagination aktif).
 */
export function QueueTable({
  contacts,
  capabilities,
  compact = false,
}: {
  contacts: Contact[];
  capabilities: ProviderCapabilities;
  compact?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  let filtered = contacts.filter((c) =>
    `${c.nama} ${c.noHp}`.toLowerCase().includes(search.toLowerCase())
  );

  if (!compact && statusFilter !== "all") {
    filtered = filtered.filter((c) => c.statusCall === statusFilter);
  }

  if (!compact) {
    filtered = [...filtered].sort((a, b) => {
      if (sortKey === "nama") return a.nama.localeCompare(b.nama);
      if (sortKey === "status") return a.statusCall.localeCompare(b.statusCall);
      if (sortKey === "followup") {
        // Belum ada jadwal ditaruh paling belakang - bukan prioritas.
        const av = a.nextFollowUpAt ?? "9999-12-31";
        const bv = b.nextFollowUpAt ?? "9999-12-31";
        return av.localeCompare(bv);
      }
      const at = a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : 0;
      const bt = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : 0;
      return bt - at;
    });
  }

  const totalPages = compact ? 1 : Math.max(1, Math.ceil(filtered.length / FULL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = compact
    ? filtered
    : filtered.slice((currentPage - 1) * FULL_PAGE_SIZE, currentPage * FULL_PAGE_SIZE);

  async function handleClaim() {
    setClaiming(true);
    const result = await claimLeads();
    setClaiming(false);

    if (!result.success) {
      toast.error("Gagal mengambil data baru.", { description: result.error });
      return;
    }
    if (!result.claimed) {
      toast.info("Tidak ada lead baru yang tersedia di pool saat ini.");
      return;
    }
    toast.success(`${result.claimed} lead baru diambil.`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Antrean Saya</h3>
          <p className="text-sm text-muted-foreground">
            {contacts.length} lead dalam antrean kamu
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama / no HP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-full sm:w-56"
            />
          </div>

          {!compact && (
            <>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v ?? "all");
                  setPage(1);
                }}
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

              <Select value={sortKey} onValueChange={(v) => setSortKey((v as SortKey) ?? "updated")}>
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

          <Button onClick={handleClaim} disabled={claiming}>
            <Plus className="h-4 w-4" />
            {claiming ? "Mengambil..." : "Ambil Data Baru"}
          </Button>
        </div>
      </div>

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
                    <div className={cn("font-medium", invalid && "line-through text-muted-foreground")}>
                      {c.nama}
                    </div>
                    <div
                      className={cn(
                        "text-xs text-muted-foreground",
                        invalid && "line-through"
                      )}
                    >
                      {c.noHp}
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
            Halaman {currentPage} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <CustomerDrawer
        contact={selected}
        open={open}
        onOpenChange={setOpen}
        capabilities={capabilities}
      />
    </div>
  );
}
