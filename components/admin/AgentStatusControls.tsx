"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { pauseAgent, resumeAgent, deactivateAgent } from "@/app/actions/agents";
import { assignContacts } from "@/app/actions/contacts";

export type AgentStatus = "active" | "pause" | "inactive";

export interface HeldContact {
  id: string;
  nama: string;
  noHp: string;
  statusCall: string;
}

export interface OtherAgentOption {
  agentId: string;
  agentName: string;
  used: number;
  capacity: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(pauseStartedAt: string | null, pauseMaxDays: number): number {
  if (!pauseStartedAt) return pauseMaxDays;
  const elapsed = Math.floor((Date.now() - new Date(pauseStartedAt).getTime()) / DAY_MS);
  return Math.max(0, pauseMaxDays - elapsed);
}

export function AgentStatusControls({
  agentId,
  agentStatus,
  pauseStartedAt,
  pauseMaxDays,
  heldContacts,
  otherAgents,
}: {
  agentId: string;
  agentStatus: AgentStatus;
  pauseStartedAt: string | null;
  pauseMaxDays: number;
  heldContacts: HeldContact[];
  otherAgents: OtherAgentOption[];
}) {
  const router = useRouter();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigningContactId, setAssigningContactId] = useState<string | null>(null);

  async function handlePause() {
    setSaving(true);
    const result = await pauseAgent(agentId, pauseReason);
    setSaving(false);
    if (!result.success) {
      toast.error("Gagal pause agen.", { description: result.error });
      return;
    }
    toast.success("Agen di-pause.");
    setPauseReason("");
    setPauseOpen(false);
    router.refresh();
  }

  async function handleResume() {
    setSaving(true);
    const result = await resumeAgent(agentId);
    setSaving(false);
    if (!result.success) {
      toast.error("Gagal mengaktifkan agen.", { description: result.error });
      return;
    }
    toast.success("Agen kembali aktif.");
    router.refresh();
  }

  async function handleDeactivate() {
    setSaving(true);
    const result = await deactivateAgent(agentId);
    setSaving(false);
    setDeactivateOpen(false);
    if (!result.success) {
      toast.error("Gagal menonaktifkan agen.", { description: result.error });
      return;
    }
    toast.success("Agen dinonaktifkan, kontak aktif dilepas ke pool.");
    router.refresh();
  }

  async function handleAssignHeldContact(contactId: string, targetAgentId: string) {
    setAssigningContactId(contactId);
    const result = await assignContacts([contactId], targetAgentId);
    setAssigningContactId(null);
    if (result.warning) {
      toast.warning(result.warning);
      return;
    }
    if (!result.success) {
      toast.error("Gagal assign.", { description: result.error });
      return;
    }
    toast.success("Kontak di-assign ke agen lain.");
    router.refresh();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {agentStatus === "active" && (
          <Badge variant="outline" className="bg-success/15 text-success border-success/30">
            Aktif
          </Badge>
        )}
        {agentStatus === "pause" && (
          <Badge variant="outline" className="bg-warning/15 text-warning-foreground border-warning/30">
            Pause ({daysLeft(pauseStartedAt, pauseMaxDays)} hari tersisa)
          </Badge>
        )}
        {agentStatus === "inactive" && (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
            Nonaktif
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {agentStatus === "active" && (
          <Button size="sm" variant="outline" onClick={() => setPauseOpen(true)}>
            Pause Agen
          </Button>
        )}
        {agentStatus === "pause" && (
          <>
            <Button size="sm" variant="outline" onClick={handleResume} disabled={saving}>
              Aktifkan Kembali
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeactivateOpen(true)}>
              Nonaktifkan
            </Button>
          </>
        )}
        {agentStatus === "inactive" && (
          <Button size="sm" variant="outline" onClick={handleResume} disabled={saving}>
            Aktifkan Kembali
          </Button>
        )}
      </div>

      {agentStatus === "pause" && (
        <div>
          <button
            type="button"
            onClick={() => setHeldOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {heldOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {heldContacts.length} kontak ditahan selama pause
          </button>
          {heldOpen && (
            <div className="mt-2 space-y-1.5 rounded-md border bg-muted/20 p-2">
              {heldContacts.length === 0 && (
                <p className="text-xs text-muted-foreground">Tidak ada kontak yang ditahan.</p>
              )}
              {heldContacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{c.nama}</span>{" "}
                    <span className="text-muted-foreground">
                      · {c.noHp} · {c.statusCall}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 px-2 text-[11px]"
                          disabled={assigningContactId === c.id}
                        >
                          Assign ke Agen Lain
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Pilih agen tujuan</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {otherAgents.map((a) => (
                          <DropdownMenuItem
                            key={a.agentId}
                            onClick={() => handleAssignHeldContact(c.id, a.agentId)}
                          >
                            {a.agentName} ({a.used}/{a.capacity} slot)
                          </DropdownMenuItem>
                        ))}
                        {otherAgents.length === 0 && (
                          <DropdownMenuItem disabled>Tidak ada agen aktif lain</DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Agen</DialogTitle>
            <DialogDescription>
              Data agen ditahan selama pause (maks {pauseMaxDays} hari) - tidak dilepas ke pool,
              tapi bisa di-assign manual ke agen lain kalau urgent. Setelah{" "}
              {pauseMaxDays} hari, agen otomatis dinonaktifkan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Alasan Pause</Label>
            <Textarea
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              rows={2}
              placeholder="Cuti, sakit, dll."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPauseOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handlePause} disabled={saving || !pauseReason.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Pause Agen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nonaktifkan Agen?</DialogTitle>
            <DialogDescription>
              Semua kontak aktif agen ini akan dilepas ke pool. Kontak Closed/Invalid tidak
              terpengaruh. Lanjutkan?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeactivateOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Ya, Nonaktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
