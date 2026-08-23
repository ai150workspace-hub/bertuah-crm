"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
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
import { formatRupiah } from "@/lib/format";
import type { ApplicationStatus } from "@/types";
import { STATUS_APLIKASI_COLORS } from "@/lib/status-colors";
import { NEXT_ALLOWED_STATUS } from "@/lib/applications";
import { UpdateApplicationStatusDialog } from "./update-application-status-dialog";

export interface AgentApplicationRow {
  id: string;
  contactName: string;
  leasingPartner: string;
  nominalPengajuan: number;
  nominalPencairan: number | null;
  statusAplikasi: ApplicationStatus;
  createdAt: string;
  rejectionReason: string | null;
}

export function ApplicationsTable({ rows }: { rows: AgentApplicationRow[] }) {
  const [activeRow, setActiveRow] = useState<AgentApplicationRow | null>(null);

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kontak</TableHead>
            <TableHead>Leasing Partner</TableHead>
            <TableHead>Nominal Pengajuan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Diajukan</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const canAdvance = (NEXT_ALLOWED_STATUS[r.statusAplikasi] ?? []).length > 0;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.contactName}</TableCell>
                <TableCell>{r.leasingPartner}</TableCell>
                <TableCell>
                  {formatRupiah(r.nominalPengajuan)}
                  {r.statusAplikasi === "Disbursed" && r.nominalPencairan !== null && (
                    <div className="text-xs text-success">
                      Cair: {formatRupiah(r.nominalPencairan)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_APLIKASI_COLORS[r.statusAplikasi]} variant="outline">
                    {r.statusAplikasi}
                  </Badge>
                  {r.statusAplikasi === "Rejected" && r.rejectionReason && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{r.rejectionReason}</div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString("id-ID")}
                </TableCell>
                <TableCell className="text-right">
                  {canAdvance ? (
                    <Button size="sm" variant="outline" onClick={() => setActiveRow(r)}>
                      <Settings2 className="h-3.5 w-3.5" /> Update Status
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Final</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Belum ada aplikasi. Ajukan dari kontak Hot Lead kamu.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {activeRow && (
        <UpdateApplicationStatusDialog
          applicationId={activeRow.id}
          contactName={activeRow.contactName}
          currentStatus={activeRow.statusAplikasi}
          open={!!activeRow}
          onOpenChange={(o) => !o && setActiveRow(null)}
        />
      )}
    </div>
  );
}
