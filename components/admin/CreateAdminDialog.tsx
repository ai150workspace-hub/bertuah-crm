"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createAdmin } from "@/app/actions/agents";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function CreateAdminDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [isRestricted, setIsRestricted] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function resetForm() {
    setName("");
    setEmail("");
    setPassword(generatePassword());
    setIsRestricted(true);
    setCreated(null);
  }

  async function handleSave() {
    setSaving(true);
    const result = await createAdmin({ name, email, password, isRestricted });
    setSaving(false);

    if (!result.success) {
      toast.error("Gagal membuat admin.", { description: result.error });
      return;
    }
    toast.success(`Admin ${name} berhasil dibuat.`);
    setCreated({ email, password });
    router.refresh();
  }

  async function handleCopyCredentials() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
      toast.success("Kredensial disalin.");
    } catch {
      toast.error("Gagal menyalin — catat manual dari layar ini.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        setOpen(next);
      }}
    >
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ShieldPlus className="h-3.5 w-3.5" /> Tambah Admin
      </Button>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Admin Berhasil Dibuat</DialogTitle>
              <DialogDescription>
                Catat atau salin kredensial ini sekarang — password tidak ditampilkan lagi setelah dialog ditutup.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Email:</span> {created.email}
              </div>
              <div>
                <span className="text-muted-foreground">Password:</span>{" "}
                <span className="font-mono">{created.password}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCopyCredentials}>
                Salin Kredensial
              </Button>
              <Button
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
              >
                Selesai
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Tambah Admin Baru</DialogTitle>
              <DialogDescription>
                Untuk login admin tambahan (mis. monitoring). Sampaikan email &amp; password ke yang
                bersangkutan secara aman setelah dibuat.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nama</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@contoh.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Password Awal</Label>
                <div className="flex gap-2">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                  <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())}>
                    Acak Ulang
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Minimal 6 karakter.</p>
              </div>
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={isRestricted}
                  onChange={(e) => setIsRestricted(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Batasi akses (monitoring only)</span>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Bisa lihat semua halaman, tapi tidak bisa buka Import Data atau pakai tombol Export
                    (CSV/Excel). Centang ini untuk admin monitoring, hilangkan untuk admin penuh.
                  </span>
                </span>
              </label>
            </div>

            <DialogFooter>
              <Button onClick={handleSave} disabled={saving || !name || !email || password.length < 6}>
                {saving ? "Membuat..." : "Buat Admin"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
