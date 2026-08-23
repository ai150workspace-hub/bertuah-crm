"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";

export interface DealDetail {
  applicationId: string;
  contactName: string;
  nominalPencairan: number;
  tenorBulan: number;
  dateDisbursed: string | null;
}

export interface AgentIncentiveRowData {
  agentId: string;
  agentName: string;
  totalPencairan: number;
  totalDailyKomisi: number;
  monthlyBonus: number;
  takeHome: number;
  revenuePku: number;
  netPku: number;
  marginPkuPct: number | null;
  tierLabel: string;
  deals: DealDetail[];
}

function tierBadgeClassName(bonus: number): string {
  if (bonus === 0) return "bg-muted text-muted-foreground border-transparent";
  if (bonus < 2_000_000) return "bg-primary/10 text-primary border-primary/20";
  if (bonus < 4_000_000) return "bg-warning/15 text-warning-foreground border-warning/30";
  if (bonus < 6_000_000) return "bg-success/15 text-success border-success/30";
  return "bg-hot/15 text-hot border-hot/30 font-semibold";
}

function marginClassName(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct > 30) return "text-success font-medium";
  if (pct >= 10) return "text-warning-foreground font-medium";
  return "text-destructive font-medium";
}

export function AgentIncentiveRow({ row }: { row: AgentIncentiveRowData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/40"
        onClick={() => setOpen((o) => !o)}
      >
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {row.deals.length > 0 ? (
              open ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )
            ) : (
              <span className="w-3.5" />
            )}
            {row.agentName}
            <Badge variant="outline" className={cn("text-[10px]", tierBadgeClassName(row.monthlyBonus))}>
              {row.tierLabel}
            </Badge>
          </div>
        </TableCell>
        <TableCell>{formatRupiah(row.totalPencairan)}</TableCell>
        <TableCell>{formatRupiah(row.totalDailyKomisi)}</TableCell>
        <TableCell>{row.monthlyBonus === 0 ? "—" : formatRupiah(row.monthlyBonus)}</TableCell>
        <TableCell className="font-bold text-foreground">{formatRupiah(row.takeHome)}</TableCell>
        <TableCell className="text-success">{formatRupiah(row.revenuePku)}</TableCell>
        <TableCell className={row.netPku >= 0 ? "text-success" : "text-destructive"}>
          {formatRupiah(row.netPku)}
        </TableCell>
        <TableCell className={marginClassName(row.marginPkuPct)}>
          {row.marginPkuPct === null ? "—" : `${row.marginPkuPct.toFixed(1)}%`}
        </TableCell>
      </TableRow>

      {open && row.deals.length > 0 && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={8} className="p-0">
            <div className="px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {row.deals.length} deal Disbursed jadi dasar hitungan ini
              </div>
              <div className="space-y-1">
                {row.deals.map((d) => (
                  <div
                    key={d.applicationId}
                    className="flex items-center justify-between gap-2 text-sm border-b border-border/60 py-1.5 last:border-0"
                  >
                    <span className="text-muted-foreground">
                      {d.dateDisbursed ?? "—"}
                    </span>
                    <span className="flex-1 truncate">{d.contactName}</span>
                    <span className="text-muted-foreground">Tenor {d.tenorBulan} bln</span>
                    <span className="font-medium">{formatRupiah(d.nominalPencairan)}</span>
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
