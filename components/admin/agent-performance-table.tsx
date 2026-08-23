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
import type { AgentPerformanceRow } from "@/lib/admin-metrics";

const MONTHLY_TARGET = 250_000_000;

export function AgentPerformanceTable({ agents }: { agents: AgentPerformanceRow[] }) {
  const rows = agents.map((agent) => ({
    agent,
    progress: Math.min(100, Math.round((agent.disbursed / MONTHLY_TARGET) * 100)),
  }));

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ agent, progress }) => (
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
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
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
