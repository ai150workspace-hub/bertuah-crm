"use server";

import { createClient } from "@/lib/supabase/server";
import { wibDayStartIso, wibDayEndIso, wibDateFromIso, wibTimeFromIso } from "@/lib/wib-date";
import { HASIL_PANGGILAN } from "@/lib/call-outcome/catalog";
import { statusWajibCatatan } from "@/lib/call-outcome/derive";

const HASIL_LABEL = new Map(HASIL_PANGGILAN.map((h) => [h.kode, h.label]));

// Batas export client-side - di atas ini, generate .xlsx di browser bisa
// nge-freeze tab (SheetJS bekerja di main thread). Sama dengan angka yang
// ditampilkan sebagai peringatan di ActivityLogTable.
const EXPORT_ROW_LIMIT = 5000;

export interface ActivityLogFilters {
  from: string;
  to: string;
  agent: string; // "all" atau users.id
  hasil: string; // "all" atau salah satu KodeHasil
  /** "wajib_catatan" = 7 status "Bicara dengan orangnya" (link dari CatatanLapangan) - dipakai kalau hasil="all". */
  hasilGroup?: string;
  q: string;
}

export interface ActivityLogExportRow {
  Tanggal: string;
  Waktu: string;
  "Nama Agen": string;
  "Nama Konsumen": string;
  "No HP": string;
  Kendaraan: string;
  "Hasil Panggilan": string;
  Catatan: string;
}

export type ExportActivityLogResult =
  | { success: true; rows: ActivityLogExportRow[] }
  | { success: false; error: string };

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Belum login." };

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { ok: false, error: "Hanya admin yang boleh melakukan ini." };

  return { ok: true };
}

interface ActivityLogJoinedRow {
  timestamp: string;
  hasil: string | null;
  call_notes: string | null;
  users: { name: string } | null;
  contacts: {
    nama: string;
    no_hp: string;
    jenis_kendaraan: string;
    merk_tipe: string | null;
    tahun: number | null;
  } | null;
}

/**
 * Export SEMUA baris yang cocok filter aktif - query langsung, bukan dari
 * state tabel yang sudah dipaginate (§B/C prompt). Dijalankan lewat Server
 * Action karena browser di app ini tidak pernah query Supabase langsung
 * (lihat lib/supabase/client.ts - tidak dipakai di komponen mana pun),
 * semua akses data lewat Server Component/Server Action seperti sisa
 * codebase ini.
 */
export async function exportActivityLogRows(
  filters: ActivityLogFilters
): Promise<ExportActivityLogResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const supabase = await createClient();

  // contacts!inner wajib supaya filter .or() di bawah (kalau ada search)
  // benar-benar membatasi baris call_logs yang dikembalikan, bukan cuma
  // menyaring kolom contacts di dalam hasil embed (perilaku default
  // PostgREST untuk left-join embed). Aman dipakai tanpa syarat karena
  // call_logs.contact_id NOT NULL + FK - setiap baris selalu punya contact.
  let query = supabase
    .from("call_logs")
    .select(
      "timestamp, hasil, call_notes, users(name), contacts!inner(nama, no_hp, jenis_kendaraan, merk_tipe, tahun)",
      { count: "exact" }
    )
    .gte("timestamp", wibDayStartIso(filters.from))
    .lte("timestamp", wibDayEndIso(filters.to));

  if (filters.agent !== "all") query = query.eq("agent_id", filters.agent);
  if (filters.hasil !== "all") query = query.eq("hasil", filters.hasil);
  else if (filters.hasilGroup === "wajib_catatan") query = query.in("hasil", statusWajibCatatan());
  if (filters.q.trim()) {
    const q = filters.q.trim();
    query = query.or(`nama.ilike.%${q}%,no_hp.ilike.%${q}%`, { referencedTable: "contacts" });
  }

  query = query.order("timestamp", { ascending: false });

  const { data, count, error } = await query.returns<ActivityLogJoinedRow[]>();
  if (error) return { success: false, error: error.message };

  if ((count ?? 0) > EXPORT_ROW_LIMIT) {
    return {
      success: false,
      error: "Silakan persempit filter tanggal, data terlalu banyak untuk export sekaligus.",
    };
  }

  const rows: ActivityLogExportRow[] = (data ?? []).map((r) => {
    const kendaraanParts = [
      r.contacts?.jenis_kendaraan,
      r.contacts?.merk_tipe,
      r.contacts?.tahun ? `(${r.contacts.tahun})` : null,
    ].filter(Boolean);

    return {
      Tanggal: wibDateFromIso(r.timestamp),
      Waktu: wibTimeFromIso(r.timestamp),
      "Nama Agen": r.users?.name ?? "—",
      "Nama Konsumen": r.contacts?.nama ?? "—",
      "No HP": r.contacts?.no_hp ?? "—",
      Kendaraan: kendaraanParts.length > 0 ? kendaraanParts.join(" ") : "—",
      "Hasil Panggilan": r.hasil ? (HASIL_LABEL.get(r.hasil as never) ?? r.hasil) : "Belum tercatat",
      Catatan: r.call_notes ?? "",
    };
  });

  return { success: true, rows };
}
