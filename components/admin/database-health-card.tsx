import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export interface DatabaseHealthSegment {
  label: string;
  count: number;
  colorClassName: string;
}

export interface DatabaseHealthData {
  segments: DatabaseHealthSegment[];
  total: number;
  touched: number;
}

export function DatabaseHealthCard({ data }: { data: DatabaseHealthData }) {
  const touchedPct = data.total > 0 ? (data.touched / data.total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health Database Keseluruhan</CardTitle>
        <CardDescription>
          {data.touched.toLocaleString("id-ID")} dari {data.total.toLocaleString("id-ID")} data
          sudah disentuh ({touchedPct.toFixed(1)}% utilisasi)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.segments.map((seg) => {
          const segPct = data.total > 0 ? (seg.count / data.total) * 100 : 0;
          return (
            <div key={seg.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={`inline-block h-2 w-2 rounded-full ${seg.colorClassName}`} />
                  {seg.label}
                </span>
                <span className="tabular-nums">
                  {seg.count.toLocaleString("id-ID")} ({segPct.toFixed(1)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${seg.colorClassName}`}
                  style={{ width: `${segPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
