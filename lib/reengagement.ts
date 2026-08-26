// lib/reengagement.ts — baca v_reengagement_leads (lihat
// 0015_script_wa_reengagement.sql). View sudah mengecualikan kontak yang
// last_reengagement_sent_at dalam 30 hari terakhir, jadi query di sini
// tinggal filter per agent.

import type { SupabaseClient } from "@supabase/supabase-js";
import { HASIL_PANGGILAN, type KodeHasil } from "@/lib/call-outcome/catalog";

const HASIL_LABEL = new Map(HASIL_PANGGILAN.map((h) => [h.kode, h.label]));

export interface ReengagementLead {
  id: string;
  nama: string;
  noHp: string;
  jenisKendaraan: string;
  merkTipe: string | null;
  tahun: number | null;
  lastOutcomeLabel: string;
  lastContactedAt: string;
}

interface RawReengagementRow {
  id: string;
  nama: string;
  no_hp: string;
  jenis_kendaraan: string;
  merk_tipe: string | null;
  tahun: number | null;
  last_outcome: string | null;
  last_contacted_at: string;
}

export async function getReengagementLeads(
  supabase: SupabaseClient,
  agentId: string
): Promise<ReengagementLead[]> {
  const { data } = await supabase
    .from("v_reengagement_leads")
    .select("id, nama, no_hp, jenis_kendaraan, merk_tipe, tahun, last_outcome, last_contacted_at")
    .eq("assigned_to", agentId)
    .order("last_contacted_at", { ascending: true });

  return ((data ?? []) as RawReengagementRow[]).map((row) => ({
    id: row.id,
    nama: row.nama,
    noHp: row.no_hp,
    jenisKendaraan: row.jenis_kendaraan,
    merkTipe: row.merk_tipe,
    tahun: row.tahun,
    lastOutcomeLabel: row.last_outcome
      ? (HASIL_LABEL.get(row.last_outcome as KodeHasil) ?? row.last_outcome)
      : "—",
    lastContactedAt: row.last_contacted_at,
  }));
}

/** Badge counter sidebar - cukup count, tidak perlu tarik semua kolom. */
export async function getReengagementCount(
  supabase: SupabaseClient,
  agentId: string
): Promise<number> {
  const { count } = await supabase
    .from("v_reengagement_leads")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", agentId);
  return count ?? 0;
}
