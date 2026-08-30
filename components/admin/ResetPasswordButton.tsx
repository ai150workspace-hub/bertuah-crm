"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
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
import { resetUserPassword } from "@/app/actions/agents";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function ResetPasswordButton({ userId, userLabel }: { userId: string; userLabel: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState(generatePassword);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  function resetLocal() {
    setPassword(generatePassword());
    setDone(false);
  }

  async function handleReset() {
    setSaving(true);
    const result = await resetUserPassword({ userId, newPassword: password });
    setSaving(false);
    if (!result.success) {
      toast.error("Gagal reset password.", { description: result.error });
      return;
    }
    toast.success(`Password ${userLabel} berhasil direset.`);
    setDone(true);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password disalin.");
    } catch {
      toast.error("Gagal menyalin — catat manual dari layar ini.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetLocal();
        setOpen(next);
      }}
    >
      <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" onClick={() => setOpen(true)}>
        <KeyRound className="h-3 w-3" /> Reset Password
      </Button>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Password Berhasil Direset</DialogTitle>
              <DialogDescription>
                Catat atau salin password baru ini sekarang — tidak ditampilkan lagi setelah dialog
                ditutup. Sampaikan ke {userLabel} secara aman.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Password Baru:</span>{" "}
                <span className="font-mono">{password}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCopy}>
                Salin Password
              </Button>
              <Button onClick={() => setOpen(false)}>Selesai</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Reset Password {userLabel}?</DialogTitle>
              <DialogDescription>
                Password lama langsung tidak berlaku, diganti password baru di bawah ini.{" "}
                {userLabel} perlu login ulang pakai password baru ini.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label className="text-xs">Password Baru</Label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())}>
                  Acak Ulang
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Minimal 6 karakter.</p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Batal
              </Button>
              <Button variant="destructive" onClick={handleReset} disabled={saving || password.length < 6}>
                {saving ? "Mereset..." : "Reset Password"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
