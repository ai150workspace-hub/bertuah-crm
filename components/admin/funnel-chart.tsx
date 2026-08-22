"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { FunnelStage } from "@/lib/admin-metrics";

const chartConfig = {
  value: {
    label: "Jumlah",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

export function FunnelChart({
  stages,
  databaseTotal,
}: {
  stages: FunnelStage[];
  databaseTotal: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Funnel Pipeline</CardTitle>
        <CardDescription>
          Dari {databaseTotal.toLocaleString("id-ID")} data database (total pool, semua waktu)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-72 w-full">
          <BarChart data={stages} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              width={110}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="var(--color-primary)" radius={4}>
              <LabelList
                dataKey="value"
                position="right"
                className="fill-foreground"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
