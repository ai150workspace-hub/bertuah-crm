"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { LeasingPartnerRow } from "@/lib/leasing-partners";
import {
  createLeasingPartner,
  updateLeasingPartner,
  toggleLeasingPartnerActive,
} from "@/app/actions/leasing-partners";

export function LeasingPartnersManager({ partners }: { partners: LeasingPartnerRow[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setEditingId(null);
    setName("");
    setDialogOpen(true);
  }

  function openEdit(p: LeasingPartnerRow) {
    setEditingId(p.id);
    setName(p.name);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const result = editingId
      ? await updateLeasingPartner(editingId, name)
      : await createLeasingPartner(name);
    setSaving(false);

    if (!result.success) {
      toast.error("Gagal menyimpan.", { description: result.error });
      return;
    }
    toast.success("Leasing partner tersimpan.");
    setDialogOpen(false);
    router.refresh();
  }

  async function handleToggleActive(p: LeasingPartnerRow) {
    const result = await toggleLeasingPartnerActive(p.id, !p.isActive);
    if (!result.success) {
      toast.error("Gagal ubah status.", { description: result.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Tambah Leasing Partner
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>PIC</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.picName ? `${p.picName}${p.picPhone ? ` · ${p.picPhone}` : ""}` : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleToggleActive(p)}
                  >
                    {p.isActive ? "Aktif" : "Nonaktif"}
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {partners.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Belum ada leasing partner.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Menonaktifkan partner cuma menyembunyikannya dari dropdown pengajuan aplikasi baru — aplikasi
        yang sudah ada dengan partner ini tidak berubah.
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Leasing Partner" : "Tambah Leasing Partner"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label className="text-xs">Nama</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Adira Finance" />
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
