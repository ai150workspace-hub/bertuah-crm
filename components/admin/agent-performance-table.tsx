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
import { AGENTS, MOCK_APPLICATIONS } from "@/lib/mock-data";
import { formatCompactRupiah } from "@/lib/format";
import { calculateAgentIncentive } from "@/lib/incentive-calculator";

const MONTHLY_TARGET = 250_000_000;

export function AgentPerformanceTable() {
  const rows = AGENTS.map((agent) => {
    const disbursed = MOCK_APPLICATIONS.filter(
      (a) => a.agentId === agent.id && a.statusAplikasi === "Disbursed"
    ).reduce((sum, a) => sum + a.nominalPencairan, 0);

    const incentive = calculateAgentIncentive({
      agentId: agent.id,
      agentName: agent.name,
      totalDisbursement: disbursed,
      avg3MonthDisbursement: disbursed,
    });

    return {
      agent,
      disbursed,
      progress: Math.min(100, Math.round((disbursed / MONTHLY_TARGET) * 100)),
      incentive,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performa Agent</CardTitle>
        <CardDescription>Bulan berjalan · target {formatCompactRupiah(MONTHLY_TARGET)}/agent</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Pencairan</TableHead>
                <TableHead className="w-[160px]">Progress Target</TableHead>
                <TableHead className="text-right">Est. Kompensasi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ agent, disbursed, progress, incentive }) => (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium">{agent.name}</TableCell>
                  <TableCell>{formatCompactRupiah(disbursed)}</TableCell>
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
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
