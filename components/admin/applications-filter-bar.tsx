"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface AgentOption {
  id: string;
  name: string;
}

export function ApplicationsFilterBar({
  statuses,
  allStatuses,
  agent,
  agents,
  leasing,
  leasingPartners,
}: {
  statuses: string[];
  allStatuses: string[];
  agent: string;
  agents: AgentOption[];
  leasing: string;
  leasingPartners: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleStatus(status: string, checked: boolean) {
    const next = checked ? [...statuses, status] : statuses.filter((s) => s !== status);
    apply({ status: next.join(",") });
  }

  const agentLabel = agent === "all" ? "Semua Agent" : (agents.find((a) => a.id === agent)?.name ?? "Agent");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm">
              <Filter className="h-3.5 w-3.5" />
              Status ({statuses.length}/{allStatuses.length})
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Filter Status Aplikasi</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {allStatuses.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={statuses.includes(s)}
                onCheckedChange={(checked) => toggleStatus(s, checked === true)}
                onSelect={(e) => e.preventDefault()}
              >
                {s}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Select value={agent} onValueChange={(v) => apply({ agent: v ?? "all" })}>
        <SelectTrigger className="w-44">
          <SelectValue>{() => agentLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua Agent</SelectItem>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={leasing} onValueChange={(v) => apply({ leasing: v ?? "all" })}>
        <SelectTrigger className="w-48">
          <SelectValue>{() => (leasing === "all" ? "Semua Leasing Partner" : leasing)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua Leasing Partner</SelectItem>
          {leasingPartners.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
