"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { removeDnc } from "@/app/actions/contacts";

export interface DncRow {
  noHp: string;
  alasan: string;
  createdAt: string;
}

export function DncSheetTrigger({ rows, count }: { rows: DncRow[]; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(noHp: string) {
    setRemovingId(noHp);
    const result = await removeDnc(noHp);
    setRemovingId(null);

    if (!result.success) {
      toast.error("Gagal menghapus dari DNC.", { description: result.error });
      return;
    }
    toast.success("Nomor dihapus dari Do Not Contact.");
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShieldOff className="h-3.5 w-3.5" /> Lihat daftar DNC ({count})
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Do Not Contact</SheetTitle>
            <SheetDescription>
              Nomor yang tidak boleh dihubungi lagi — otomatis diblokir dari drip queue.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No HP</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.noHp}>
                      <TableCell>{r.noHp}</TableCell>
                      <TableCell className="text-sm">{r.alasan}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString("id-ID")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={removingId === r.noHp}
                          onClick={() => handleRemove(r.noHp)}
                          title="Hapus dari DNC"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Belum ada nomor di Do Not Contact.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
