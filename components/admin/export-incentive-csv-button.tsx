"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentIncentiveResult } from "@/lib/incentive-calculator";

export function ExportIncentiveCsvButton({
  rows,
  month,
  year,
}: {
  rows: AgentIncentiveResult[];
  month: number;
  year: number;
}) {
  function handleExport() {
    const header = [
      "Nama Agen",
      "Total Pencairan",
      "Komisi Harian",
      "Bonus Bulanan",
      "Take-Home",
      "Revenue PKU",
      "Net PKU",
      "Margin PKU",
    ];
    const lines = rows.map((r) =>
      [
        `"${r.agentName.replace(/"/g, '""')}"`,
        r.totalPencairan,
        r.totalDailyKomisi,
        r.monthlyBonus,
        r.takeHome,
        r.revenuePku,
        r.netPku,
        r.marginPkuPct === null ? "" : `${r.marginPkuPct.toFixed(1)}%`,
      ].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incentive_${year}-${String(month).padStart(2, "0")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4" /> Export CSV
    </Button>
  );
}
