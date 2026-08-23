import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";

const BULAN_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export interface HistoryPeriod {
  bulan: number;
  tahun: number;
  totalTakeHome: number;
  totalNetPku: number;
  agentCount: number;
}

export function IncentiveHistory({ periods }: { periods: HistoryPeriod[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Riwayat Bulan Terkunci</CardTitle>
        <CardDescription>
          6 bulan terakhir yang sudah difinalisasi lewat &quot;Kunci Bulan Ini&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {periods.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Belum ada bulan yang dikunci. Riwayat akan muncul di sini setelah kamu
            mengunci minimal satu periode.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Agent Terkunci</TableHead>
                  <TableHead>Total Take-Home</TableHead>
                  <TableHead>Total Net PKU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((p) => (
                  <TableRow key={`${p.tahun}-${p.bulan}`}>
                    <TableCell className="font-medium">
                      {BULAN_SINGKAT[p.bulan - 1]} {p.tahun}
                    </TableCell>
                    <TableCell>{p.agentCount}</TableCell>
                    <TableCell>{formatRupiah(p.totalTakeHome)}</TableCell>
                    <TableCell className={p.totalNetPku >= 0 ? "text-success" : "text-destructive"}>
                      {formatRupiah(p.totalNetPku)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
