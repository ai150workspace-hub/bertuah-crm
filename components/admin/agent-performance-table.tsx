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
import { Progress } from "@/components/ui/progress";
import { formatCompactRupiah } from "@/lib/format";
import { calculateAgentIncentive } from "@/lib/incentive-calculator";
import type { AgentPerformanceRow } from "@/lib/admin-metrics";

const MONTHLY_TARGET = 250_000_000;

export function AgentPerformanceTable({ agents }: { agents: AgentPerformanceRow[] }) {
  const rows = agents.map((agent) => {
    // avg3MonthDisbursement idealnya rata-rata 3 bulan terakhir - belum ada
    // riwayat bulanan tersimpan, jadi dipakai sama dengan pencairan periode
    // ini sebagai pendekatan sementara.
    const incentive = calculateAgentIncentive({
      agentId: agent.agentId,
      agentName: agent.agentName,
      totalDisbursement: agent.disbursed,
      avg3MonthDisbursement: agent.disbursed,
    });

    return {
      agent,
      progress: Math.min(100, Math.round((agent.disbursed / MONTHLY_TARGET) * 100)),
      incentive,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performa Agent</CardTitle>
        <CardDescription>
          Periode terpilih · target {formatCompactRupiah(MONTHLY_TARGET)}/agent/bulan
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Dial</TableHead>
                <TableHead>Pencairan</TableHead>
                <TableHead className="w-[160px]">Progress Target</TableHead>
                <TableHead className="text-right">Est. Kompensasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ agent, progress, incentive }) => (
                <TableRow key={agent.agentId}>
                  <TableCell className="font-medium">{agent.agentName}</TableCell>
                  <TableCell>{agent.totalDial}</TableCell>
                  <TableCell>{formatCompactRupiah(agent.disbursed)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={progress} className="h-2" />
                      <span className="text-xs text-muted-foreground w-9 text-right">
                        {progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCompactRupiah(incentive.totalCompensation)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Belum ada agent aktif.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
