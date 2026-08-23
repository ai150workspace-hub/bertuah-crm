"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function IncentivePeriodPicker({ month, year }: { month: number; year: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(nextMonth: number, nextYear: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("incMonth", String(nextMonth));
    params.set("incYear", String(nextYear));
    router.push(`${pathname}?${params.toString()}`);
  }

  const years = Array.from({ length: 5 }, (_, i) => year - 3 + i);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(month)}
        onValueChange={(v) => v && apply(Number(v), year)}
      >
        <SelectTrigger className="w-40">
          <SelectValue>{(v: string | null) => (v ? BULAN[Number(v) - 1] : "")}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {BULAN.map((label, i) => (
            <SelectItem key={label} value={String(i + 1)}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={String(year)}
        onValueChange={(v) => v && apply(month, Number(v))}
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
