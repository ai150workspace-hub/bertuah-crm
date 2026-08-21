"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Phone, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { Contact } from "@/types";
import { STATUS_CALL_COLORS } from "@/lib/status-colors";
import { CustomerDrawer } from "./customer-drawer";

export function LeadQueueTable({ contacts }: { contacts: Contact[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const filtered = contacts.filter((c) =>
    `${c.nama} ${c.noHp}`.toLowerCase().includes(search.toLowerCase())
  );

  function handleClaim() {
    setClaiming(true);
    setTimeout(() => {
      setClaiming(false);
      toast.success("15 lead baru diambil (mode demo).", {
        description: "Belum tersambung ke database — antrean di bawah masih data contoh.",
      });
    }, 700);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Antrean Saya</h3>
          <p className="text-sm text-muted-foreground">
            {contacts.length} lead dalam antrean kamu
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama / no HP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-full sm:w-56"
            />
          </div>
          <Button onClick={handleClaim} disabled={claiming}>
            <Plus className="h-4 w-4" />
            {claiming ? "Mengambil..." : "Ambil Data Baru"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Kendaraan</TableHead>
              <TableHead className="hidden md:table-cell">Area</TableHead>
              <TableHead>Status Call</TableHead>
              <TableHead className="hidden sm:table-cell">Last Call</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-medium">{c.nama}</div>
                  <div className="text-xs text-muted-foreground">{c.noHp}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{c.merkTipe}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.jenisKendaraan} · {c.tahun}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {c.domisili}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_CALL_COLORS[c.statusCall]} variant="outline">
                    {c.statusCall}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                  {c.lastContactedAt
                    ? formatDistanceToNow(new Date(c.lastContactedAt), {
                        addSuffix: true,
                        locale: idLocale,
                      })
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelected(c);
                      setOpen(true);
                    }}
                  >
                    <Phone className="h-3.5 w-3.5" /> Panggil
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Tidak ada lead yang cocok.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CustomerDrawer contact={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
