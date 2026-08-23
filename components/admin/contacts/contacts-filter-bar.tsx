"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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

export function ContactsFilterBar({
  statuses,
  allStatuses,
  assigned,
  q,
  agents,
}: {
  statuses: string[];
  allStatuses: string[];
  assigned: string;
  q: string;
  agents: AgentOption[];
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
    params.delete("page"); // filter berubah -> balik ke halaman 1
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleStatus(status: string, checked: boolean) {
    const next = checked
      ? [...statuses, status]
      : statuses.filter((s) => s !== status);
    apply({ status: next.join(",") });
  }

  const assignedLabel =
    assigned === "all"
      ? "Semua Agent"
      : assigned === "unassigned"
        ? "Unassigned"
        : (agents.find((a) => a.id === assigned)?.name ?? "Agent");

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
            <DropdownMenuLabel>Filter Status Call</DropdownMenuLabel>
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

      <Select value={assigned} onValueChange={(v) => apply({ assigned: v ?? "all" })}>
        <SelectTrigger className="w-44">
          <SelectValue>{() => assignedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua Agent</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {agents.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <form
        className="relative flex-1 max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
          apply({ q: input.value });
        }}
      >
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="Cari nama / no HP..." className="pl-8" />
      </form>
    </div>
  );
}
