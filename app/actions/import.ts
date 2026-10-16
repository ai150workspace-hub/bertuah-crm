"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneLocal } from "@/lib/import/phone-local";
import { distributeAutoRoundRobin, type AgentCapacity } from "@/lib/import/distribute";
import { getAgentCapacitiesBulk } from "@/lib/contacts";
import {
  normalisasiRating,
  normalisasiStatusKontrak,
  normalisasiPekerjaan,
  pisahCatatanLama,
  ratingUntukSimpan,
  ringkasKolomBaru,
  type RingkasanKolomBaru,
} from "@/lib/profil-kontak";

export interface RawImportRow {
  nama: string;
  noHp: string;
  jenisKendaraan: string;
  merkTipe: string;
  tahun: string;
  domisili: string;
  /** Kolom template baru. Boleh kosong / tidak ada di file. */
  pekerjaan: string;
  rating: string;
  statusKontrak: string;
  /**
   * Header LAMA "catatan" (template sebelum 0030). Isinya dulu campuran
   * rating lama atau pekerjaan - dipisah di validateImportRows, tidak
   * pernah lagi masuk ke contacts.notes.
   */
  catatan: string;
}

export type RowStatus = "valid" | "duplicate" | "invalid";

export interface ValidatedRow {
  index: number;
  nama: string;
  noHpRaw: string;
  noHpNormalized: string | null;
  jenisKendaraan: "Mobil" | "Motor" | null;
  merkTipe: string;
  tahun: number | null;
  domisili: string;
  /** Huruf kecil, spasi dirapatkan; "" kalau kosong. Disimpan ke contacts.pekerjaan. */
  pekerjaan: string;
  /** Bentuk kanonik (Excellent, Good, CR-1, ...) atau rating lama huruf kecil; null kalau kosong / tidak dikenali. */
  rating: string | null;
  /** RRD / ICP / EXP / LIV; null kalau kosong / tidak dikenali. Disimpan ke contacts.status_kredit_kendaraan. */
  statusKontrak: string | null;
  /** Sel rating terisi tapi di luar daftar (disimpan kosong). */
  ratingTidakDikenali: boolean;
  statusKontrakTidakDikenali: boolean;
  status: RowStatus;
  reason?: string;
}

const TAHUN_MIN = 1990;
const TAHUN_MAX = 2030;

export interface ValidateImportResult {
  success: boolean;
  /** Diisi kalau success false - mis. pengecekan duplikat ke database gagal. */
  error?: string;
  rows: ValidatedRow[];
  summary: { valid: number; duplicate: number; invalid: number };
  /** Kolom pekerjaan / rating / status kontrak dari baris yang akan diimpor (bukan format salah). */
  kolomBaru?: RingkasanKolomBaru;
}

// PostgREST memotong hasil SATU query ke 1.000 baris secara diam-diam
// kalau tidak pakai .range()/count - dan .in() dengan ribuan nilai bisa
// membuat URL query ditolak sebelum sampai ke database. Kejadian nyata:
// file 3.591 baris gagal total karena sebagian nomor yang sudah ada di
// database lolos deteksi duplikat, lalu insert-nya melanggar
// idx_contacts_no_hp_unique. Candidate numbers dipecah jadi potongan
// kecil di sini - beda dari lib/supabase/pagination.ts:fetchAllRows()
// yang menangani hasil query besar lewat .range(), bukan input .in()
// yang besar (pola berbeda, jadi tidak dipaksakan pakai helper itu).
const DUPLICATE_CHECK_CHUNK_SIZE = 500;

export async function validateImportRows(rows: RawImportRow[]): Promise<ValidateImportResult> {
  const supabase = await createClient();

  const seenInFile = new Set<string>();
  const prelim: ValidatedRow[] = rows.map((r, index) => {
    const nama = (r.nama ?? "").trim();
    const jenisRaw = (r.jenisKendaraan ?? "").trim().toLowerCase();
    const jenisKendaraan: "Mobil" | "Motor" | null =
      jenisRaw === "mobil" ? "Mobil" : jenisRaw === "motor" ? "Motor" : null;
    const noHpNormalized = normalizePhoneLocal(r.noHp);
    const merkTipe = (r.merkTipe ?? "").trim();

    const tahunRaw = (r.tahun ?? "").trim();
    let tahun: number | null = null;
    let tahunInvalid = false;
    if (tahunRaw) {
      const parsed = Number(tahunRaw);
      if (Number.isInteger(parsed) && parsed >= TAHUN_MIN && parsed <= TAHUN_MAX) {
        tahun = parsed;
      } else {
        tahunInvalid = true;
      }
    }

    // Pekerjaan: kolom "pekerjaan" didahulukan; kalau kosong dan file
    // memakai header lama "catatan", dipisah dengan aturan yang sama dengan
    // backfill 0030 (rating lama vs pekerjaan). notes TIDAK diisi dari sini.
    let pekerjaan = normalisasiPekerjaan(r.pekerjaan);
    let ratingLama: string | null = null;
    if (!pekerjaan && (r.catatan ?? "").trim()) {
      const pisah = pisahCatatanLama(r.catatan);
      pekerjaan = pisah.pekerjaan;
      ratingLama = pisah.ratingLama;
    }

    const ratingMentah = (r.rating ?? "").trim();
    const rating: string | null = ratingMentah ? normalisasiRating(ratingMentah) : ratingLama;
    const ratingTidakDikenali = Boolean(ratingMentah) && rating === null;

    const kontrakMentah = (r.statusKontrak ?? "").trim();
    const statusKontrak = kontrakMentah ? normalisasiStatusKontrak(kontrakMentah) : null;
    const statusKontrakTidakDikenali = Boolean(kontrakMentah) && statusKontrak === null;

    let status: RowStatus = "valid";
    let reason: string | undefined;

    if (!nama) {
      status = "invalid";
      reason = "Nama kosong";
    } else if (!noHpNormalized) {
      status = "invalid";
      reason = "Format nomor HP tidak valid";
    } else if (!jenisKendaraan) {
      status = "invalid";
      reason = "Jenis kendaraan harus Mobil/Motor";
    } else if (tahunInvalid) {
      status = "invalid";
      reason = `Tahun harus angka ${TAHUN_MIN}-${TAHUN_MAX}`;
    } else if (seenInFile.has(noHpNormalized)) {
      status = "duplicate";
      reason = "Duplikat di dalam file";
    }

    if (status === "valid" && noHpNormalized) seenInFile.add(noHpNormalized);

    return {
      index,
      nama,
      noHpRaw: r.noHp ?? "",
      noHpNormalized,
      jenisKendaraan,
      merkTipe,
      tahun,
      domisili: (r.domisili ?? "").trim(),
      pekerjaan,
      rating,
      statusKontrak,
      ratingTidakDikenali,
      statusKontrakTidakDikenali,
      status,
      reason,
    };
  });

  const candidateNumbers = [
    ...new Set(
      prelim
        .filter((r) => r.status === "valid" && r.noHpNormalized)
        .map((r) => r.noHpNormalized!)
    ),
  ];

  const existing = new Set<string>();
  // Dipecah jadi potongan DUPLICATE_CHECK_CHUNK_SIZE, satu query per
  // potongan - lihat catatan di atas DUPLICATE_CHECK_CHUNK_SIZE.
  for (let i = 0; i < candidateNumbers.length; i += DUPLICATE_CHECK_CHUNK_SIZE) {
    const chunk = candidateNumbers.slice(i, i + DUPLICATE_CHECK_CHUNK_SIZE);
    // Bandingkan dalam bentuk ternormalisasi juga di sisi database - no_hp
    // yang tersimpan seharusnya sudah format lokal '0812...', tapi baris
    // lama bisa saja tidak konsisten.
    const { data, error } = await supabase.from("contacts").select("no_hp").in("no_hp", chunk);
    if (error) {
      // JANGAN diam-diam lanjut dengan set kosong - itu bikin sebagian
      // nomor yang sudah ada lolos sebagai "valid" lalu insert-nya
      // melanggar idx_contacts_no_hp_unique, persis bug yang mau
      // diperbaiki di sini. Hentikan validasi, kembalikan error yang
      // jelas ke pemanggil (lihat components/admin/import-wizard.tsx).
      return {
        success: false,
        error: `Gagal memeriksa duplikat di database: ${error.message}`,
        rows: [],
        summary: { valid: 0, duplicate: 0, invalid: 0 },
      };
    }
    for (const d of data ?? []) {
      const normalized = normalizePhoneLocal(d.no_hp as string);
      if (normalized) existing.add(normalized);
    }
  }

  const finalRows: ValidatedRow[] = prelim.map((r) => {
    if (r.status === "valid" && r.noHpNormalized && existing.has(r.noHpNormalized)) {
      return { ...r, status: "duplicate", reason: "Sudah ada di database" };
    }
    return r;
  });

  const summary = {
    valid: finalRows.filter((r) => r.status === "valid").length,
    duplicate: finalRows.filter((r) => r.status === "duplicate").length,
    invalid: finalRows.filter((r) => r.status === "invalid").length,
  };

  return {
    success: true,
    rows: finalRows,
    summary,
    kolomBaru: ringkasKolomBaru(finalRows.filter((r) => r.status !== "invalid")),
  };
}

export interface AgentCapacityInfo {
  agentId: string;
  agentName: string;
  used: number;
  capacity: number;
}

export async function getAgentCapacities(): Promise<AgentCapacityInfo[]> {
  const supabase = await createClient();
  const { data: agentRows } = await supabase
    .from("users")
    .select("id, name, kapasitas_data")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("name");

  // Active slots (Uncalled + In Progress + Warm) - Invalid/Hot Lead/Closed
  // tidak dihitung. Lihat 0010_active_slot_capacity.sql. Satu query untuk
  // semua agen (bukan satu query per agen).
  return getAgentCapacitiesBulk(supabase, agentRows ?? []);
}

export async function updateAgentCapacity(
  agentId: string,
  kapasitas: number
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isFinite(kapasitas) || kapasitas < 0) {
    return { success: false, error: "Kapasitas harus angka >= 0." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ kapasitas_data: kapasitas })
    .eq("id", agentId)
    .eq("role", "agent");
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/import");
  return { success: true };
}

export interface CommitImportInput {
  filename: string;
  rows: ValidatedRow[];
  skipDuplicates: boolean;
  mode: "auto" | "manual" | "unassigned";
  manualAgentId?: string;
}

export interface CommitImportResult {
  success: boolean;
  error?: string;
  imported?: number;
  duplicateSkipped?: number;
  errorCount?: number;
  batchId?: string;
  importedRows?: ValidatedRow[];
  /** Pekerjaan / rating / status kontrak dari baris yang diimpor, termasuk nilai tidak dikenali per kolom. */
  kolomBaru?: RingkasanKolomBaru;
}

export async function commitImport(input: CommitImportInput): Promise<CommitImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

  // Lapis keamanan sebenarnya untuk admin monitoring - halaman
  // /admin/import sudah memblokir di UI, tapi itu bisa dilewati kalau
  // action ini dipanggil langsung. RLS tidak membedakan admin biasa vs
  // monitoring (keduanya role='admin'), jadi dicek eksplisit di sini.
  const { data: profile } = await supabase
    .from("users")
    .select("is_restricted_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_restricted_admin) {
    return { success: false, error: "Akun Anda hanya untuk monitoring, tidak bisa mengimpor data." };
  }

  const importable = input.rows.filter(
    (r) => r.status === "valid" || (r.status === "duplicate" && !input.skipDuplicates)
  );
  const duplicateSkipped = input.rows.filter(
    (r) => r.status === "duplicate" && input.skipDuplicates
  ).length;
  const errorCount = input.rows.filter((r) => r.status === "invalid").length;

  if (importable.length === 0) {
    return { success: false, error: "Tidak ada baris valid untuk diimpor." };
  }

  if (input.mode === "manual" && !input.manualAgentId) {
    return { success: false, error: "Pilih agent tujuan untuk mode Manual Assign." };
  }

  const { data: batch, error: batchErr } = await supabase
    .from("data_batches")
    .insert({
      filename: input.filename,
      total_rows: input.rows.length,
      imported_rows: 0,
      duplicate_rows: duplicateSkipped,
      error_rows: errorCount,
      mode_distribusi: input.mode,
      uploaded_by: user.id,
      status: "Processing",
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    return { success: false, error: batchErr?.message ?? "Gagal membuat batch." };
  }

  const assignedMap = new Map<number, string | null>();

  if (input.mode === "unassigned") {
    for (const r of importable) assignedMap.set(r.index, null);
  } else if (input.mode === "manual") {
    for (const r of importable) assignedMap.set(r.index, input.manualAgentId!);
  } else {
    const capacities: AgentCapacityInfo[] = await getAgentCapacities();
    const plan = distributeAutoRoundRobin(
      importable.map((r) => r.index),
      capacities as AgentCapacity[]
    );
    for (const a of plan.assignments) assignedMap.set(a.rowIndex, a.agentId);
  }

  const now = new Date().toISOString();
  const payload = importable.map((r) => {
    const assignedTo = assignedMap.get(r.index) ?? null;
    return {
      nama: r.nama,
      no_hp: r.noHpNormalized,
      jenis_kendaraan: r.jenisKendaraan,
      merk_tipe: r.merkTipe || null,
      tahun: r.tahun,
      domisili: r.domisili || null,
      // Nilai dinormalisasi ULANG di server - baris datang dari klien,
      // jangan dipercaya apa adanya. notes sengaja kosong saat impor:
      // kolom itu dipakai sistem untuk jejak otomatis, bukan data nasabah.
      pekerjaan: normalisasiPekerjaan(r.pekerjaan) || null,
      rating: ratingUntukSimpan(r.rating),
      status_kredit_kendaraan: normalisasiStatusKontrak(r.statusKontrak),
      notes: null,
      status_call: "Uncalled",
      assigned_to: assignedTo,
      assigned_at: assignedTo ? now : null,
      batch_id: batch.id,
      source: "CSV Import",
    };
  });

  const { error: insertErr } = await supabase.from("contacts").insert(payload);

  if (insertErr) {
    await supabase.from("data_batches").update({ status: "Failed" }).eq("id", batch.id);
    return { success: false, error: insertErr.message, batchId: batch.id };
  }

  await supabase
    .from("data_batches")
    .update({ imported_rows: payload.length, status: "Completed" })
    .eq("id", batch.id);

  revalidatePath("/admin/import");
  revalidatePath("/agent/dashboard");
  revalidatePath("/admin/dashboard");

  return {
    success: true,
    imported: payload.length,
    duplicateSkipped,
    errorCount,
    batchId: batch.id,
    importedRows: importable,
    kolomBaru: ringkasKolomBaru(importable),
  };
}
