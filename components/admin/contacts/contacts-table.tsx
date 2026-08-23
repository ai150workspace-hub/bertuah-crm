"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ChevronDown, UserPlus, UserMinus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { StatusCall } from "@/types";
import { STATUS_CALL_COLORS } from "@/lib/status-colors";
import { assignContacts, releaseContactsToPool } from "@/app/actions/contacts";

export interface AdminContactRow {
  id: string;
  nama: string;
  noHp: string;
  jenisKendaraan: string;
  statusCall: string;
  assignedTo: string | null;
  assignedToName: string | null;
  updatedAt: string;
}

export interface AgentCapacityOption {
  agentId: string;
  agentName: string;
  used: number;
  capacity: number;
}

export function ContactsTable({
  rows,
  agentCapacities,
}: {
  rows: AdminContactRow[];
  agentCapacities: AgentCapacityOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState<string[] | null>(null);
  const [pendingAssign, setPendingAssign] = useState<{
    agentId: string;
    ids: string[];
    warning: string;
  } | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))
    );
  }

  async function handleAssign(agentId: string, ids: string[], force = false) {
    setAssigning(true);
    const result = await assignContacts(ids, agentId, force);
    setAssigning(false);

    if (result.warning) {
      setPendingAssign({ agentId, ids, warning: result.warning });
      return;
    }
    if (!result.success) {
      toast.error("Gagal assign.", { description: result.error });
      return;
    }
    toast.success(`${ids.length} kontak di-assign.`);
    setSelected(new Set());
    setPendingAssign(null);
    router.refresh();
  }

  async function handleRelease(ids: string[]) {
    setReleasing(true);
    const result = await releaseContactsToPool(ids);
    setReleasing(false);
    setConfirmRelease(null);
    if (!result.success) {
      toast.error("Gagal lepas ke pool.", { description: result.error });
      return;
    }
    toast.success(`${ids.length} kontak dilepas ke pool.`);
    setSelected(new Set());
    router.refresh();
  }

  const selectedIds = [...selected];

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} kontak dipilih</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline" disabled={assigning}>
                  Assign ke Agent <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Pilih agent tujuan</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {agentCapacities.map((a) => (
                  <DropdownMenuItem key={a.agentId} onClick={() => handleAssign(a.agentId, selectedIds)}>
                    {a.agentName} ({a.used}/{a.capacity} slot)
                  </DropdownMenuItem>
                ))}
                {agentCapacities.length === 0 && (
                  <DropdownMenuItem disabled>Tidak ada agent aktif</DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={() => setConfirmRelease(selectedIds)}>
            <UserMinus className="h-3.5 w-3.5" /> Lepas ke Pool
          </Button>
        </div>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                  aria-label="Pilih semua"
                />
              </TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>No HP</TableHead>
              <TableHead>Kendaraan</TableHead>
              <TableHead>Status Call</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Pilih ${r.nama}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{r.nama}</TableCell>
                <TableCell>{r.noHp}</TableCell>
                <TableCell>{r.jenisKendaraan}</TableCell>
                <TableCell>
                  <Badge
                    className={STATUS_CALL_COLORS[r.statusCall as StatusCall]}
                    variant="outline"
                  >
                    {r.statusCall}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.assignedToName ?? <span className="text-muted-foreground">Unassigned</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(r.updatedAt), {
                    addSuffix: true,
                    locale: idLocale,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  {r.assignedTo ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Lepas ke Pool"
                      onClick={() => setConfirmRelease([r.id])}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button size="icon-sm" variant="ghost" title="Assign">
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Assign ke</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {agentCapacities.map((a) => (
                            <DropdownMenuItem
                              key={a.agentId}
                              onClick={() => handleAssign(a.agentId, [r.id])}
                            >
                              {a.agentName} ({a.used}/{a.capacity} slot)
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Tidak ada kontak yang cocok filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!confirmRelease} onOpenChange={(o) => !o && setConfirmRelease(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lepas {confirmRelease?.length ?? 0} kontak ke Unassigned Pool?</DialogTitle>
            <DialogDescription>
              Status call tidak diubah — kontak Warm tetap Warm. Setelah dilepas, kontak bisa
              diambil ulang lewat drip queue atau di-assign manual ke agent lain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRelease(null)} disabled={releasing}>
              Batal
            </Button>
            <Button
              onClick={() => confirmRelease && handleRelease(confirmRelease)}
              disabled={releasing}
            >
              {releasing && <Loader2 className="h-4 w-4 animate-spin" />}
              Ya, Lepas ke Pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingAssign} onOpenChange={(o) => !o && setPendingAssign(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Melebihi Kapasitas Normal</DialogTitle>
            <DialogDescription>{pendingAssign?.warning}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingAssign(null)} disabled={assigning}>
              Batal
            </Button>
            <Button
              onClick={() =>
                pendingAssign && handleAssign(pendingAssign.agentId, pendingAssign.ids, true)
              }
              disabled={assigning}
            >
              {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
              Ya, Lanjutkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
