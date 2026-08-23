"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NEXT_ALLOWED_STATUS, type NextApplicationStatus } from "@/lib/applications";
import { todayWib } from "@/lib/wib-date";

export interface ApplicationActionResult {
  success: boolean;
  error?: string;
}

export interface CreateApplicationInput {
  contactId: string;
  leasingPartner: string;
  nominalPengajuan: number;
  tenorBulan?: number | null;
  leasingContactName?: string | null;
  leasingContactPhone?: string | null;
  notes?: string | null;
}

export async function createApplication(
  input: CreateApplicationInput
): Promise<ApplicationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

  if (!input.leasingPartner.trim()) {
    return { success: false, error: "Nama leasing partner wajib diisi." };
  }
  if (!input.nominalPengajuan || input.nominalPengajuan <= 0) {
    return { success: false, error: "Nominal pengajuan wajib diisi." };
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, status_call, assigned_to")
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contact || contact.assigned_to !== user.id) {
    return { success: false, error: "Kontak tidak ditemukan atau bukan milik kamu." };
  }
  if (contact.status_call !== "Hot Lead") {
    return { success: false, error: "Hanya kontak berstatus Hot Lead yang bisa diajukan aplikasi." };
  }

  // Hanya boleh ajukan baru kalau belum pernah punya aplikasi, atau
  // aplikasi sebelumnya Rejected (retry). Draft/.../Disbursed memblokir -
  // yang sudah Disbursed tidak perlu diajukan ulang lewat picker ini.
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("contact_id", input.contactId)
    .neq("status_aplikasi", "Rejected")
    .maybeSingle();
  if (existing) {
    return { success: false, error: "Kontak ini sudah punya aplikasi yang masih berjalan atau sudah cair." };
  }

  const { error } = await supabase.from("applications").insert({
    contact_id: input.contactId,
    agent_id: user.id,
    leasing_partner: input.leasingPartner.trim(),
    leasing_contact_name: input.leasingContactName?.trim() || null,
    leasing_contact_phone: input.leasingContactPhone?.trim() || null,
    nominal_pengajuan: input.nominalPengajuan,
    tenor_bulan: input.tenorBulan ?? null,
    notes: input.notes?.trim() || null,
    status_aplikasi: "Draft",
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/agent/applications");
  return { success: true };
}

export interface AdvanceStatusInput {
  applicationId: string;
  nextStatus: NextApplicationStatus;
  /** YYYY-MM-DD - dipakai untuk date_submitted/date_survey/date_approved/date_disbursed. */
  dateValue?: string | null;
  nominalPencairan?: number | null;
  angsuranPerBulan?: number | null;
  rejectionReason?: string | null;
}

export async function advanceApplicationStatus(
  input: AdvanceStatusInput
): Promise<ApplicationActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Belum login." };

  const { data: app } = await supabase
    .from("applications")
    .select("id, agent_id, status_aplikasi")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!app || app.agent_id !== user.id) {
    return { success: false, error: "Aplikasi tidak ditemukan atau bukan milik kamu." };
  }

  const allowed = NEXT_ALLOWED_STATUS[app.status_aplikasi] ?? [];
  if (!allowed.includes(input.nextStatus)) {
    return {
      success: false,
      error: `Tidak bisa pindah dari ${app.status_aplikasi} ke ${input.nextStatus}.`,
    };
  }

  if (input.nextStatus === "Rejected" && !input.rejectionReason?.trim()) {
    return { success: false, error: "Alasan penolakan wajib diisi." };
  }
  if (input.nextStatus === "Disbursed" && (!input.nominalPencairan || input.nominalPencairan <= 0)) {
    return { success: false, error: "Nominal pencairan wajib diisi." };
  }
  if (input.dateValue && input.dateValue > todayWib()) {
    return { success: false, error: "Tanggal tidak boleh di masa depan." };
  }

  const dateOnly = input.dateValue ?? todayWib();
  const update: Record<string, unknown> = { status_aplikasi: input.nextStatus };

  if (input.nextStatus === "Sent to Leasing") {
    update.date_submitted = new Date(dateOnly).toISOString();
  }
  if (input.nextStatus === "Survey") {
    update.date_survey = dateOnly;
  }
  if (input.nextStatus === "Approved") {
    update.date_approved = dateOnly;
    if (input.angsuranPerBulan) update.angsuran_per_bulan = input.angsuranPerBulan;
  }
  if (input.nextStatus === "Disbursed") {
    update.date_disbursed = dateOnly;
    update.nominal_pencairan = input.nominalPencairan;
    if (input.angsuranPerBulan) update.angsuran_per_bulan = input.angsuranPerBulan;
  }
  if (input.nextStatus === "Rejected") {
    update.rejection_reason = input.rejectionReason!.trim();
  }

  const { error } = await supabase.from("applications").update(update).eq("id", input.applicationId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/agent/applications");
  return { success: true };
}
