import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, StatusCall, VehicleType } from "@/types";
import type { ActiveSlotsInfo } from "@/components/agent/QueueTable";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { todayWib, wibDayEndIso } from "@/lib/wib-date";

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

/**
 * Slot aktif = Uncalled + (In Progress/Warm yang butuh dikerjakan HARI
 * INI). Lihat public.is_contact_active_today() di
 * 0022_active_slot_today_only.sql - dipakai buat state tombol "Ambil
 * Data Baru" dan angka kapasitas yang ditampilkan.
 */
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

export interface AgentCapacityInfo {
  agentId: string;
  agentName: string;
  used: number;
  capacity: number;
}

/**
 * Kapasitas slot aktif (Uncalled + In Progress + Warm) untuk SEMUA agen
 * sekaligus - satu query total, bukan satu query per agen (N+1).
 * Dipakai bareng oleh admin/contacts/page.tsx dan app/actions/import.ts
 * yang sebelumnya masing-masing punya implementasi N+1 sendiri.
 *
 * SENGAJA BEDA dari getActiveSlots()/get_agent_active_slots() - fungsi
 * itu sejak 0022_active_slot_today_only.sql cuma hitung In Progress/Warm
 * yang jatuh tempo HARI INI (dipakai tombol self-claim + assign manual
 * admin). Di sini tetap hitung SELURUH backlog tanpa lihat tanggal,
 * karena dipakai auto-distribusi saat import CSV - supaya import tidak
 * menumpuk data baru ke agent yang sebenarnya masih banyak follow-up
 * tertunda, walau belum jatuh tempo hari ini.
 */
export async function getAgentCapacitiesBulk(
  supabase: SupabaseClient,
  agents: { id: string; name: string; kapasitas_data: number }[]
): Promise<AgentCapacityInfo[]> {
  if (agents.length === 0) return [];

  const { data } = await supabase
    .from("contacts")
    .select("assigned_to")
    .in(
      "assigned_to",
      agents.map((a) => a.id)
    )
    .in("status_call", ["Uncalled", "In Progress", "Warm"]);

  const used = new Map<string, number>();
  for (const row of data ?? []) {
    const agentId = row.assigned_to as string;
    used.set(agentId, (used.get(agentId) ?? 0) + 1);
  }

  return agents.map((a) => ({
    agentId: a.id,
    agentName: a.name,
    used: used.get(a.id) ?? 0,
    capacity: a.kapasitas_data,
  }));
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

/**
 * Jumlah kontak yang follow-up-nya jatuh tempo (hari ini atau sudah
 * terlambat) - badge sidebar "Antrean Saya". Definisi "jatuh tempo" sama
 * dengan filter "due" di app/(dashboard)/agent/queue/page.tsx - kalau
 * salah satu diubah, ubah juga yang satunya. Cuma ambil angka (bukan
 * baris), sama seperti getReengagementCount() di lib/reengagement.ts.
 */
export async function getDueFollowUpCount(
  supabase: SupabaseClient,
  agentId: string
): Promise<number> {
  const { count } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", agentId)
    .in("status_call", ["Uncalled", "In Progress", "Warm", "Hot Lead"])
    .not("next_follow_up_at", "is", null)
    .lte("next_follow_up_at", wibDayEndIso(todayWib()));
  return count ?? 0;
}
