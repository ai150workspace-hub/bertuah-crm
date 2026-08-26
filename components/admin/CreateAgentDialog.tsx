"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
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
import { createAgent } from "@/app/actions/agents";

const DEFAULT_KAPASITAS = 100;

function generatePassword(): string {
  // Cukup buat password awal yang gampang di-copy-paste ke agent baru,
  // bukan untuk keamanan jangka panjang - agent bisa ganti sendiri nanti
  // kalau fitur ganti password sudah ada. 10 karakter alfanumerik.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function CreateAgentDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [kapasitas, setKapasitas] = useState(String(DEFAULT_KAPASITAS));
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  function resetForm() {
    setName("");
    setEmail("");
    setPassword(generatePassword());
    setKapasitas(String(DEFAULT_KAPASITAS));
    setCreated(null);
  }

  async function handleSave() {
    setSaving(true);
    const result = await createAgent({
      name,
      email,
      password,
      kapasitasData: Number(kapasitas),
    });
    setSaving(false);

    if (!result.success) {
      toast.error("Gagal membuat agent.", { description: result.error });
      return;
    }
    toast.success(`Agent ${name} berhasil dibuat.`);
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
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Tambah Agent
      </Button>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Agent Berhasil Dibuat</DialogTitle>
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
              <DialogTitle>Tambah Agent Baru</DialogTitle>
              <DialogDescription>
                Membuat akun login sekaligus profil agent. Sampaikan email &amp; password ke agent secara aman
                setelah dibuat.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nama</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap agent" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@contoh.com"
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
                <p className="text-[11px] text-muted-foreground">Minimal 6 karakter. Agent bisa pakai ini untuk login pertama.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kapasitas Data Aktif</Label>
                <Input
                  type="number"
                  value={kapasitas}
                  onChange={(e) => setKapasitas(e.target.value)}
                  className="w-28"
                />
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleSave} disabled={saving || !name || !email || password.length < 6}>
                {saving ? "Membuat..." : "Buat Agent"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
