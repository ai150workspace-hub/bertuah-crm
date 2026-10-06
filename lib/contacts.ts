import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, StatusCall, VehicleType } from "@/types";
import type { ActiveSlotsInfo } from "@/components/agent/QueueTable";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { todayWib, wibDayStartIso, wibDayEndIso } from "@/lib/wib-date";

// Status yang masih perlu ditindaklanjuti (belum final). Satu-satunya
// definisi - dipakai app/(dashboard)/agent/queue/page.tsx (filter "aktif")
// dan app/(dashboard)/agent/dashboard/page.tsx (KPI "My Leads") supaya
// keduanya tidak pernah bisa berbeda.
export const ACTIVE_STATUSES = ["Uncalled", "In Progress", "Warm", "Hot Lead"];

// ---------------------------------------------------------------------
// "Kerjakan Hari Ini" (antrean agen) = gabungan dua kelompok:
//   (a) follow-up jatuh tempo: status aktif dan next_follow_up_at <= akhir
//       hari ini WIB (sama dengan filter "due").
//   (b) In Progress yang layak dicoba lagi: tidak punya jadwal follow-up
//       dan belum ditelepon hari ini WIB. Kontak In Progress yang SUDAH
//       dijadwalkan ke tanggal mendatang sengaja tidak masuk - agen sudah
//       berjanji meneleponnya di tanggal itu.
// Dua kelompok itu tidak pernah tumpang tindih (a butuh jadwal, b tanpa
// jadwal). Waktu dikirim sebagai UTC ISO (bukan "+07:00") karena dipakai di
// dalam string .or() PostgREST.
// ---------------------------------------------------------------------
function kerjakanHariIniBatas() {
  const today = todayWib();
  return {
    awalHariMs: new Date(wibDayStartIso(today)).getTime(),
    akhirHariMs: new Date(wibDayEndIso(today)).getTime(),
    awalHariUtc: new Date(wibDayStartIso(today)).toISOString(),
    akhirHariUtc: new Date(wibDayEndIso(today)).toISOString(),
  };
}

/** String untuk query.or(...) - tambahkan .eq("assigned_to", agentId) di pemanggil. */
export function kerjakanHariIniOrFilter(): string {
  const { awalHariUtc, akhirHariUtc } = kerjakanHariIniBatas();
  const aktif = ACTIVE_STATUSES.map((s) => `"${s}"`).join(",");
  const jatuhTempo = `and(status_call.in.(${aktif}),next_follow_up_at.lte.${akhirHariUtc})`;
  const cobaLagi = `and(status_call.eq."In Progress",next_follow_up_at.is.null,or(last_contacted_at.is.null,last_contacted_at.lt.${awalHariUtc}))`;
  return `${jatuhTempo},${cobaLagi}`;
}

export interface BarisUrutPrioritas {
  id: string;
  status_call: string;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
}

/**
 * Urutan bawaan antrean agen: (a) follow-up jatuh tempo, paling terlambat
 * di atas; (b) In Progress yang layak dicoba lagi (paling lama tidak
 * disentuh di atas); (c) sisanya, last_contacted_at menurun seperti urutan
 * lama. Tidak bisa dinyatakan sebagai ORDER BY PostgREST biasa, jadi
 * pemanggil menarik kolom urut yang ringan lewat fetchAllRows lalu
 * mengurutkan di sini - baris lengkap cuma diambil untuk 1 halaman.
 */
export function urutkanPrioritasKerja(rows: BarisUrutPrioritas[]): BarisUrutPrioritas[] {
  const { awalHariMs, akhirHariMs } = kerjakanHariIniBatas();
  const ms = (v: string | null) => (v ? new Date(v).getTime() : null);

  const info = rows.map((r) => {
    const fu = ms(r.next_follow_up_at);
    const lc = ms(r.last_contacted_at);
    const jatuhTempo = ACTIVE_STATUSES.includes(r.status_call) && fu !== null && fu <= akhirHariMs;
    const cobaLagi =
      r.status_call === "In Progress" && fu === null && (lc === null || lc < awalHariMs);
    return { r, fu, lc, rank: jatuhTempo ? 0 : cobaLagi ? 1 : 2 };
  });

  info.sort((x, y) => {
    if (x.rank !== y.rank) return x.rank - y.rank;
    if (x.rank === 0) return (x.fu as number) - (y.fu as number) || x.r.id.localeCompare(y.r.id);
    if (x.rank === 1) return (x.lc ?? -Infinity) - (y.lc ?? -Infinity) || x.r.id.localeCompare(y.r.id);
    // c: last_contacted_at menurun, yang belum pernah ditelepon paling belakang.
    if (x.lc === null && y.lc === null) return x.r.id.localeCompare(y.r.id);
    if (x.lc === null) return 1;
    if (y.lc === null) return -1;
    return y.lc - x.lc || x.r.id.localeCompare(y.r.id);
  });

  return info.map((i) => i.r);
}

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

  // fetchAllRows, bukan .select() polos - dipakai auto-distribusi import
  // CSV, jadi harus lengkap begitu kontak aktif tim tumbuh lewat 1.000
  // (lihat lib/supabase/pagination.ts).
  const rows = await fetchAllRows<{ assigned_to: string | null }>((from, to) =>
    supabase
      .from("contacts")
      .select("assigned_to")
      .in(
        "assigned_to",
        agents.map((a) => a.id)
      )
      .in("status_call", ["Uncalled", "In Progress", "Warm"])
      .range(from, to)
  );

  const used = new Map<string, number>();
  for (const row of rows) {
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
 * Tandai dua hal berbeda dari SATU query call_logs yang sama - satu
 * query untuk semua kontak, bukan per-kontak:
 *
 *   hasPreviousCalls   - kontak ini punya call log, milik siapa pun.
 *                        Dipakai buat memunculkan panel "Riwayat
 *                        Panggilan" di customer drawer (termasuk
 *                        riwayat milik agen sendiri, sejak program
 *                        percobaan ulang / menelepon ulang nomor yang
 *                        sama 2-3 kali).
 *   hasOtherAgentCalls - kontak ini pernah dihubungi agen LAIN (bukan
 *                        currentAgentId). Ini makna asli/lama dari
 *                        penanda "recycled" - dipakai badge "Recycled"
 *                        di QueueTable.tsx. HARUS tetap terpisah dari
 *                        hasPreviousCalls, karena kontak yang cuma
 *                        pernah ditelepon oleh agen yang sama BUKAN
 *                        kontak recycled.
 *
 * RLS call_logs cuma izinkan agent lihat log miliknya sendiri (by
 * design), jadi query lintas-agen ini butuh service role.
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
    .select("contact_id, agent_id")
    .in(
      "contact_id",
      contacts.map((c) => c.id)
    );
  const rows = data ?? [];
  const adaLog = new Set(rows.map((r) => r.contact_id as string));
  const adaLogAgenLain = new Set(
    rows.filter((r) => r.agent_id !== currentAgentId).map((r) => r.contact_id as string)
  );
  return contacts.map((c) => ({
    ...c,
    hasPreviousCalls: adaLog.has(c.id),
    hasOtherAgentCalls: adaLogAgenLain.has(c.id),
  }));
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
