"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import {
  AgentStatusControls,
  type AgentStatus,
  type HeldContact,
  type OtherAgentOption,
} from "@/components/admin/AgentStatusControls";

export interface AgentFunnelStage {
  label: string;
  value: number;
}

export interface AgentCallDistribution {
  connected: number;
  unconnected: number;
  hotLead: number;
  warm: number;
  inProgress: number;
  closed: number;
}

export interface AgentRecentCall {
  timestamp: string;
  contactName: string;
  hasilLabel: string;
  durationSec: number | null;
}

export interface AgentReportRow {
  agentId: string;
  agentName: string;
  lastActivity: string | null;
  // Utilisasi Data
  dataDiAssign: number;
  sudahDikerjakan: number;
  uncalledSisa: number;
  utilisasiPercent: number | null;
  // Kapasitas slot aktif (Uncalled + In Progress + Warm)
  activeSlotCount: number;
  kapasitas: number;
  invalidCount: number;
  // Activity Panggilan (periode)
  totalCall: number;
  connected: number;
  contactRatePercent: number | null;
  // Pipeline Strength (all-time)
  hotLead: number;
  warm: number;
  closed: number;
  conversionRatePercent: number | null;
  // Aplikasi & Revenue (periode)
  aplikasiMasuk: number;
  disbursedCount: number;
  totalPencairan: number;
  // Drill-down
  funnel: AgentFunnelStage[];
  callDistribution: AgentCallDistribution;
  recentCalls: AgentRecentCall[];
  // Status & Kontrol
  agentStatus: AgentStatus;
  pauseStartedAt: string | null;
  pauseMaxDays: number;
  heldContacts: HeldContact[];
  otherAgents: OtherAgentOption[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isActiveToday(lastActivity: string | null): boolean {
  if (!lastActivity) return false;
  return Date.now() - new Date(lastActivity).getTime() <= DAY_MS;
}

function isStale(lastActivity: string | null): boolean {
  if (!lastActivity) return true;
  return Date.now() - new Date(lastActivity).getTime() > 3 * DAY_MS;
}

function utilisasiColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct > 70) return "text-success font-medium";
  if (pct >= 40) return "text-warning-foreground font-medium";
  return "text-destructive font-medium";
}

function contactRateColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct > 30) return "text-success font-medium";
  if (pct >= 15) return "text-warning-foreground font-medium";
  return "text-destructive font-medium";
}

function conversionColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct > 15) return "text-success font-medium";
  if (pct >= 8) return "text-warning-foreground font-medium";
  return "text-destructive font-medium";
}

function pct(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

function formatDuration(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}d` : `${s}d`;
}

export function MiniFunnel({ stages }: { stages: AgentFunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-1.5">
      {stages.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-muted-foreground">{s.label}</span>
          <div className="h-4 flex-1 rounded bg-muted overflow-hidden">
            <div
              className="h-full rounded bg-primary/70"
              style={{ width: `${(s.value / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right tabular-nums font-medium">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

export function CallDistributionBar({ dist }: { dist: AgentCallDistribution }) {
  const total = dist.connected + dist.unconnected;
  const connectedPct = total > 0 ? (dist.connected / total) * 100 : 0;
  const subTotal = Math.max(1, dist.hotLead + dist.warm + dist.inProgress + dist.closed);

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Connected vs Unconnected</span>
          <span className="tabular-nums">
            {dist.connected} / {total}
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded bg-muted">
          <div className="h-full bg-success" style={{ width: `${connectedPct}%` }} />
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Sub-breakdown Connected</div>
        <div className="flex h-3 w-full overflow-hidden rounded bg-muted">
          <div className="h-full bg-hot" style={{ width: `${(dist.hotLead / subTotal) * 100}%` }} />
          <div className="h-full bg-warning" style={{ width: `${(dist.warm / subTotal) * 100}%` }} />
          <div className="h-full bg-primary" style={{ width: `${(dist.inProgress / subTotal) * 100}%` }} />
          <div className="h-full bg-muted-foreground/50" style={{ width: `${(dist.closed / subTotal) * 100}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span><span className="inline-block h-2 w-2 rounded-full bg-hot" /> Hot Lead {dist.hotLead}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-warning" /> Warm {dist.warm}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-primary" /> In Progress {dist.inProgress}</span>
          <span><span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" /> Closed {dist.closed}</span>
        </div>
      </div>
    </div>
  );
}

function AgentRow({ row }: { row: AgentReportRow }) {
  const [open, setOpen] = useState(false);
  const active = isActiveToday(row.lastActivity);
  const stale = isStale(row.lastActivity);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen((o) => !o)}>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            {row.agentName}
          </div>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <AgentStatusControls
            agentId={row.agentId}
            agentStatus={row.agentStatus}
            pauseStartedAt={row.pauseStartedAt}
            pauseMaxDays={row.pauseMaxDays}
            heldContacts={row.heldContacts}
            otherAgents={row.otherAgents}
          />
        </TableCell>
        <TableCell>
          {active ? (
            <Badge variant="outline" className="bg-success/15 text-success border-success/30">
              Aktif Hari Ini
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Tidak Ada Activity
            </Badge>
          )}
        </TableCell>
        <TableCell>
          <div>
            {row.activeSlotCount} aktif / {row.kapasitas} kapasitas
          </div>
          {(row.invalidCount > 0 || row.hotLead > 0) && (
            <div className="text-[11px] text-muted-foreground">
              {[
                row.invalidCount > 0 ? `+${row.invalidCount} Invalid` : null,
                row.hotLead > 0 ? `+${row.hotLead} Hot Lead` : null,
              ]
                .filter(Boolean)
                .join(", ")}{" "}
              (tidak dihitung)
            </div>
          )}
        </TableCell>
        <TableCell>{row.sudahDikerjakan}</TableCell>
        <TableCell>{row.uncalledSisa}</TableCell>
        <TableCell className={utilisasiColor(row.utilisasiPercent)}>{pct(row.utilisasiPercent)}</TableCell>
        <TableCell>{row.totalCall}</TableCell>
        <TableCell>{row.connected}</TableCell>
        <TableCell className={contactRateColor(row.contactRatePercent)}>{pct(row.contactRatePercent)}</TableCell>
        <TableCell>{row.hotLead}</TableCell>
        <TableCell>{row.warm}</TableCell>
        <TableCell>{row.closed}</TableCell>
        <TableCell className={conversionColor(row.conversionRatePercent)}>{pct(row.conversionRatePercent)}</TableCell>
        <TableCell>{row.aplikasiMasuk}</TableCell>
        <TableCell>{row.disbursedCount}</TableCell>
        <TableCell>{formatRupiah(row.totalPencairan)}</TableCell>
        <TableCell className={cn(stale && "text-destructive font-medium")}>
          {row.lastActivity
            ? formatDistanceToNow(new Date(row.lastActivity), { addSuffix: true, locale: idLocale })
            : "Belum pernah"}
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={18} className="p-0">
            <div className="grid gap-4 px-4 py-4 lg:grid-cols-3">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Funnel Pipeline
                </div>
                <MiniFunnel stages={row.funnel} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Distribusi Hasil Call (periode terpilih)
                </div>
                <CallDistributionBar dist={row.callDistribution} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  5 Call Log Terakhir
                </div>
                <div className="space-y-1.5">
                  {row.recentCalls.length === 0 && (
                    <div className="text-xs text-muted-foreground">Belum ada call log.</div>
                  )}
                  {row.recentCalls.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5 text-xs last:border-0"
                    >
                      <span className="w-20 shrink-0 text-muted-foreground">
                        {new Date(c.timestamp).toLocaleDateString("id-ID")}
                      </span>
                      <span className="flex-1 truncate">{c.contactName}</span>
                      <span className="w-28 shrink-0 truncate text-muted-foreground">{c.hasilLabel}</span>
                      <span className="w-12 shrink-0 text-right tabular-nums">
                        {formatDuration(c.durationSec)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function AgentsReportTable({ rows }: { rows: AgentReportRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agen</TableHead>
            <TableHead>Status &amp; Kontrol</TableHead>
            <TableHead>Status Aktif</TableHead>
            <TableHead>Slot Aktif</TableHead>
            <TableHead>Sudah Dikerjakan</TableHead>
            <TableHead>Uncalled Sisa</TableHead>
            <TableHead>Utilisasi %</TableHead>
            <TableHead>Total Call</TableHead>
            <TableHead>Connected</TableHead>
            <TableHead>Contact Rate</TableHead>
            <TableHead>Hot Lead</TableHead>
            <TableHead>Warm</TableHead>
            <TableHead>Closed</TableHead>
            <TableHead>Conversion Rate</TableHead>
            <TableHead>Aplikasi Masuk</TableHead>
            <TableHead>Disbursed</TableHead>
            <TableHead>Total Pencairan</TableHead>
            <TableHead>Terakhir Call</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <AgentRow key={row.agentId} row={row} />
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={18} className="text-center text-muted-foreground py-8">
                Belum ada agent aktif.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
