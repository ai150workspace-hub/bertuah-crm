"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneLocal } from "@/lib/import/phone-local";
import { distributeAutoRoundRobin, type AgentCapacity } from "@/lib/import/distribute";

export interface RawImportRow {
  nama: string;
  noHp: string;
  jenisKendaraan: string;
  merkTipe: string;
  tahun: string;
  domisili: string;
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
  catatan: string;
  status: RowStatus;
  reason?: string;
}

const TAHUN_MIN = 1990;
const TAHUN_MAX = 2030;

export interface ValidateImportResult {
  rows: ValidatedRow[];
  summary: { valid: number; duplicate: number; invalid: number };
}

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
      catatan: (r.catatan ?? "").trim(),
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

  let existing = new Set<string>();
  if (candidateNumbers.length) {
    // Bandingkan dalam bentuk ternormalisasi juga di sisi database - no_hp
    // yang tersimpan seharusnya sudah format lokal '0812...', tapi baris
    // lama bisa saja tidak konsisten.
    const { data } = await supabase.from("contacts").select("no_hp").in("no_hp", candidateNumbers);
    existing = new Set(
      (data ?? [])
        .map((d) => normalizePhoneLocal(d.no_hp as string))
        .filter((v): v is string => v !== null)
    );
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

  return { rows: finalRows, summary };
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

  const agents = agentRows ?? [];
  const results = await Promise.all(
    agents.map(async (a) => {
      // Active slots (Uncalled + In Progress + Warm) - Invalid/Hot Lead/
      // Closed tidak dihitung. Lihat 0010_active_slot_capacity.sql.
      const { count } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("assigned_to", a.id)
        .in("status_call", ["Uncalled", "In Progress", "Warm"]);
      return {
        agentId: a.id as string,
        agentName: a.name as string,
        used: count ?? 0,
        capacity: a.kapasitas_data as number,
      };
    })
  );
  return results;
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
}

export async function commitImport(input: CommitImportInput): Promise<CommitImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

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
      notes: r.catatan || null,
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
  };
}
