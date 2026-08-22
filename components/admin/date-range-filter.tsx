"use client";

import { useRouter, usePathname } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatDateID,
  todayWib,
  addDaysWib,
  startOfWeekWib,
  startOfMonthWib,
} from "@/lib/wib-date";

const PRESETS = [
  { key: "today", label: "Hari Ini" },
  { key: "yesterday", label: "Kemarin" },
  { key: "week", label: "Minggu Ini" },
  { key: "month", label: "Bulan Ini" },
] as const;

function presetRange(key: (typeof PRESETS)[number]["key"]): { from: string; to: string } {
  const today = todayWib();
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDaysWib(today, -1);
      return { from: y, to: y };
    }
    case "week":
      return { from: startOfWeekWib(today), to: today };
    case "month":
      return { from: startOfMonthWib(today), to: today };
  }
}

export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function apply(next: { from: string; to: string }) {
    const params = new URLSearchParams({ from: next.from, to: next.to });
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant="outline"
            onClick={() => apply(presetRange(p.key))}
          >
            {p.label}
          </Button>
        ))}
        <div className="flex items-center gap-1.5 pl-1">
          <input
            key={`from-${from}`}
            type="date"
            defaultValue={from}
            max={to}
            onChange={(e) => e.target.value && apply({ from: e.target.value, to })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
          />
          <span className="text-xs text-muted-foreground">s/d</span>
          <input
            key={`to-${to}`}
            type="date"
            defaultValue={to}
            min={from}
            onChange={(e) => e.target.value && apply({ from, to: e.target.value })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5 shrink-0" />
        Menampilkan data periode: {formatDateID(from)} — {formatDateID(to)}
      </div>
    </div>
  );
}
