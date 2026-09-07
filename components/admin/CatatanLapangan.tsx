"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDateTimeShortID } from "@/lib/wib-date";
import { HASIL_PANGGILAN, type KodeHasil, type KategoriCatatan } from "@/lib/call-outcome/catalog";
import { statusWajibCatatan, statusByKategoriCatatan, kategoriCatatan } from "@/lib/call-outcome/derive";
import type { CatatanLapanganEntry } from "@/lib/admin-metrics";

// Daftar 7 status wajib catatan & pengelompokannya diambil dari
// lib/call-outcome/catalog.ts / derive.ts (satu-satunya sumber) - tidak
// ditulis ulang di sini.
const STATUS_WAJIB = statusWajibCatatan();
const STATUS_OPTIONS = HASIL_PANGGILAN.filter((h) => STATUS_WAJIB.includes(h.kode));

const TABS: { key: "semua" | KategoriCatatan; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "positif", label: "Berhasil (Tertarik & Janji Ketemu)" },
  { key: "netral", label: "Perlu Follow-up (Pikir-pikir & Konfirmasi)" },
  { key: "negatif", label: "Tolak/Gagal" },
];

const BADGE_STYLE: Record<KategoriCatatan, string> = {
  positif: "border-hot/30 bg-hot/10 text-hot",
  netral: "border-blue-200 bg-blue-50 text-blue-700",
  negatif: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function CatatanLapangan({
  entries,
  from,
  to,
}: {
  entries: CatatanLapanganEntry[];
  from: string;
  to: string;
}) {
  const [tab, setTab] = useState<"semua" | KategoriCatatan>("semua");
  const [statusFokus, setStatusFokus] = useState<KodeHasil | "all">("all");

  const kodeDalamTab = tab === "semua" ? STATUS_WAJIB : statusByKategoriCatatan(tab);
  const filtered = entries.filter(
    (e) => kodeDalamTab.includes(e.kode) && (statusFokus === "all" || e.kode === statusFokus)
  );

  const lihatSemuaHref = `/admin/activity-log?${new URLSearchParams({
    from,
    to,
    hasil_group: "wajib_catatan",
  }).toString()}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catatan dari Lapangan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={tab === t.key ? "default" : "outline"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          <Select
            value={statusFokus}
            onValueChange={(v) => setStatusFokus((v as KodeHasil | "all") ?? "all")}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Semua status">
                {(v: string | null) =>
                  v && v !== "all"
                    ? (STATUS_OPTIONS.find((s) => s.kode === v)?.label ?? "Status")
                    : "Semua status"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.kode} value={s.kode}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Belum ada catatan yang cocok filter pada periode ini.
          </p>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((e) => {
              const kategori = kategoriCatatan(e.kode) ?? "netral";
              return (
                <div key={e.id} className="space-y-1.5 rounded-lg border p-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                      BADGE_STYLE[kategori]
                    )}
                  >
                    {e.label}
                  </span>
                  <p className="text-sm">&ldquo;{e.catatan}&rdquo;</p>
                  <p className="text-xs text-muted-foreground">
                    — {e.agentName} · {e.namaKonsumen} · {formatDateTimeShortID(e.timestamp)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t pt-3">
          <Button variant="ghost" size="sm" nativeButton={false} render={
            <Link href={lihatSemuaHref}>
              Lihat semua di Log Aktivitas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          } />
        </div>
      </CardContent>
    </Card>
  );
}
