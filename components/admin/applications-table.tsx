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

export interface AdminApplicationRow {
  id: string;
  agentName: string;
  contactName: string;
  leasingPartner: string;
  nominalPengajuan: number;
  nominalPencairan: number | null;
  statusAplikasi: ApplicationStatus;
  createdAt: string;
  rejectionReason: string | null;
}

export function ApplicationsTable({ rows }: { rows: AdminApplicationRow[] }) {
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agen</TableHead>
            <TableHead>Kontak</TableHead>
            <TableHead>Leasing Partner</TableHead>
            <TableHead>Nominal Pengajuan</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Diajukan</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.agentName}</TableCell>
              <TableCell>{r.contactName}</TableCell>
              <TableCell>{r.leasingPartner}</TableCell>
              <TableCell>
                {formatRupiah(r.nominalPengajuan)}
                {r.statusAplikasi === "Disbursed" && r.nominalPencairan !== null && (
                  <div className="text-xs text-success">Cair: {formatRupiah(r.nominalPencairan)}</div>
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
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Tidak ada aplikasi yang cocok filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
