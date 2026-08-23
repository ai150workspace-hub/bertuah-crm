import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, StatusCall, VehicleType } from "@/types";
import type { ActiveSlotsInfo } from "@/components/agent/QueueTable";
import { createServiceRoleClient } from "@/lib/supabase/service";

/** Raw shape selected from public.contacts. */
export interface ContactRow {
  id: string;
  nama: string;
  no_hp: string;
  jenis_kendaraan: string;
  merk_tipe: string | null;
  tahun: number | null;
  domisili: string | null;
  status_pajak: string | null;
  status_call: string;
  status_prospek: string | null;
  assigned_to: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
}

export function mapDbContact(row: ContactRow): Contact {
  return {
    id: row.id,
    nama: row.nama,
    noHp: row.no_hp,
    jenisKendaraan: row.jenis_kendaraan as VehicleType,
    merkTipe: row.merk_tipe ?? "",
    tahun: row.tahun ?? 0,
    domisili: row.domisili ?? "",
    statusPajak: (row.status_pajak ?? "Tidak Tahu") as Contact["statusPajak"],
    statusCall: row.status_call as StatusCall,
    statusProspek: row.status_prospek ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    lastContactedAt: row.last_contacted_at ?? undefined,
    nextFollowUpAt: row.next_follow_up_at ?? undefined,
  };
}

export const CONTACT_SELECT =
  "id, nama, no_hp, jenis_kendaraan, merk_tipe, tahun, domisili, status_pajak, status_call, status_prospek, assigned_to, last_contacted_at, next_follow_up_at";

/** Slot aktif (Uncalled + In Progress + Warm) - lihat 0010_active_slot_capacity.sql. */
export async function getActiveSlots(
  supabase: SupabaseClient,
  agentId: string
): Promise<ActiveSlotsInfo | null> {
  const { data } = await supabase.rpc("get_agent_active_slots", { p_agent_id: agentId });
  const row = data?.[0] as
    | { active_count: number; kapasitas: number; available: number; is_full: boolean }
    | undefined;
  if (!row) return null;
  return {
    activeCount: row.active_count,
    kapasitas: row.kapasitas,
    available: row.available,
    isFull: row.is_full,
  };
}

/**
 * Tandai kontak yang pernah dihubungi agen LAIN (recycled dari Warm/In
 * Progress) - satu query untuk semua kontak, bukan per-kontak.
 *
 * RLS call_logs cuma izinkan agent lihat log miliknya sendiri (by
 * design), jadi query "log dari agen lain" ini butuh service role.
 * `currentAgentId` datang dari sesi yang sudah terautentikasi di
 * pemanggil - bukan input bebas dari klien.
 */
export async function markPreviousCallFlags(
  contacts: Contact[],
  currentAgentId: string
): Promise<Contact[]> {
  if (contacts.length === 0) return contacts;
  const service = createServiceRoleClient();
  const { data } = await service
    .from("call_logs")
    .select("contact_id")
    .in(
      "contact_id",
      contacts.map((c) => c.id)
    )
    .neq("agent_id", currentAgentId);
  const flagged = new Set((data ?? []).map((r) => r.contact_id as string));
  return contacts.map((c) => ({ ...c, hasPreviousCalls: flagged.has(c.id) }));
}
