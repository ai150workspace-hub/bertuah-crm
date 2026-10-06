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
//   (b) In Progress yang layak dicoba lagi: tidak punya jadwal follow-up,
//       belum ditelepon hari ini WIB, DAN punya < BATAS_PERCOBAAN call log
//       (pagar yang sama dengan jalur klaim assign_contacts_to_agent,
//       migrasi 0027 - supaya kontak yang sudah ditelepon 3 kali tidak
//       muncul lagi sebagai "kerjakan hari ini"). Kontak In Progress yang
//       SUDAH dijadwalkan ke tanggal mendatang sengaja tidak masuk - agen
//       sudah berjanji meneleponnya di tanggal itu.
// Dua kelompok itu tidak pernah tumpang tindih (a butuh jadwal, b tanpa
// jadwal). Waktu dikirim sebagai UTC ISO (bukan "+07:00") karena dipakai di
// dalam string .or() PostgREST.
//
// Syarat jumlah call log TIDAK bisa ditulis di filter PostgREST (tidak ada
// filter atas hasil agregat) - filter SQL di bawah hanya menyaring kasar,
// lalu lampirkanJumlahLog() + saringKerjakanHariIni() menyelesaikannya.
// ---------------------------------------------------------------------

/** Sama dengan pagar "< 3 baris call_logs" di assign_contacts_to_agent (migrasi 0027). */
export const BATAS_PERCOBAAN = 3;

function kerjakanHariIniBatas() {
  const today = todayWib();
  return {
    awalHariMs: new Date(wibDayStartIso(today)).getTime(),
    akhirHariMs: new Date(wibDayEndIso(today)).getTime(),
    awalHariUtc: new Date(wibDayStartIso(today)).toISOString(),
    akhirHariUtc: new Date(wibDayEndIso(today)).toISOString(),
  };
}

/** String untuk query.or(...) - tambahkan .eq("assigned_to", agentId) di pemanggil. Penyaringan kasar; lihat catatan di atas. */
export function kerjakanHariIniOrFilter(): string {
  const { awalHariUtc, akhirHariUtc } = kerjakanHariIniBatas();
  const aktif = ACTIVE_STATUSES.map((s) => `"${s}"`).join(",");
  const jatuhTempo = `and(status_call.in.(${aktif}),next_follow_up_at.lte.${akhirHariUtc})`;
  const cobaLagi = `and(status_call.eq."In Progress",next_follow_up_at.is.null,or(last_contacted_at.is.null,last_contacted_at.lt.${awalHariUtc}))`;
  return `${jatuhTempo},${cobaLagi}`;
}

export interface BarisUrutPrioritas {
  id: string;
  nama?: string;
  status_call: string;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  /** Jumlah call_logs milik SIAPA PUN - diisi lampirkanJumlahLog() cuma untuk kandidat (b). */
  jumlah_log?: number;
}

const msOf = (v: string | null) => (v ? new Date(v).getTime() : null);

function adalahJatuhTempo(r: BarisUrutPrioritas, akhirHariMs: number): boolean {
  const fu = msOf(r.next_follow_up_at);
  return ACTIVE_STATUSES.includes(r.status_call) && fu !== null && fu <= akhirHariMs;
}

/** Kandidat (b) SEBELUM syarat jumlah call log - dipakai untuk memilih baris yang perlu dihitung log-nya. */
function adalahKandidatCobaLagi(r: BarisUrutPrioritas, awalHariMs: number): boolean {
  const lc = msOf(r.last_contacted_at);
  return (
    r.status_call === "In Progress" &&
    r.next_follow_up_at === null &&
    (lc === null || lc < awalHariMs)
  );
}

/** Jumlah log yang belum diketahui dianggap TIDAK layak (lebih aman daripada menyuruh agen menelepon lagi). */
function adalahLayakCobaLagi(r: BarisUrutPrioritas, awalHariMs: number): boolean {
  return (
    adalahKandidatCobaLagi(r, awalHariMs) &&
    r.jumlah_log !== undefined &&
    r.jumlah_log < BATAS_PERCOBAAN
  );
}

/**
 * Lampirkan jumlah call_logs (milik SIAPA PUN) ke kandidat kelompok (b).
 * Pakai service role: RLS call_logs cuma mengizinkan agen melihat log
 * miliknya sendiri, sedangkan pagar di jalur klaim menghitung semua log -
 * kalau dihitung lewat sesi agen, kontak yang sudah ditelepon agen lain
 * akan terhitung kurang. `rows` datang dari query yang sudah difilter
 * assigned_to = agen yang login (RLS); service role hanya membaca jumlahnya.
 * Gagal membaca -> jumlah tak diketahui -> dianggap tidak layak.
 */
export async function lampirkanJumlahLog<T extends BarisUrutPrioritas>(rows: T[]): Promise<T[]> {
  const { awalHariMs } = kerjakanHariIniBatas();
  const ids = rows.filter((r) => adalahKandidatCobaLagi(r, awalHariMs)).map((r) => r.id);
  if (ids.length === 0) return rows;

  const service = createServiceRoleClient();
  const jumlah = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await service
      .from("contacts")
      .select("id, call_logs(count)")
      .in("id", ids.slice(i, i + 200));
    if (error) {
      console.error("lampirkanJumlahLog gagal:", error.message);
      continue;
    }
    for (const d of (data ?? []) as { id: string; call_logs: { count: number }[] | null }[]) {
      jumlah.set(d.id, d.call_logs?.[0]?.count ?? 0);
    }
  }
  return rows.map((r) => (jumlah.has(r.id) ? { ...r, jumlah_log: jumlah.get(r.id)! } : r));
}

/** Isi akhir filter "Kerjakan Hari Ini": semua (a) + (b) yang lolos pagar percobaan. Butuh lampirkanJumlahLog() lebih dulu. */
export function saringKerjakanHariIni<T extends BarisUrutPrioritas>(rows: T[]): T[] {
  const { awalHariMs, akhirHariMs } = kerjakanHariIniBatas();
  return rows.filter((r) => adalahJatuhTempo(r, akhirHariMs) || adalahLayakCobaLagi(r, awalHariMs));
}

/**
 * Urutan manual (pilihan dropdown Urut) untuk daftar yang sudah ditarik ke
 * memori - dipakai filter "Kerjakan Hari Ini", yang tidak bisa dipotong per
 * halaman di SQL karena syarat jumlah call log. Meniru ORDER BY di
 * queue/page.tsx; yang tanpa nilai selalu paling belakang.
 */
export function urutkanManual<T extends BarisUrutPrioritas>(
  rows: T[],
  kunci: "nama" | "status" | "followup" | "updated"
): T[] {
  const byId = (x: T, y: T) => x.id.localeCompare(y.id);
  const sorted = [...rows];
  sorted.sort((x, y) => {
    if (kunci === "nama") return (x.nama ?? "").localeCompare(y.nama ?? "") || byId(x, y);
    if (kunci === "status") return x.status_call.localeCompare(y.status_call) || byId(x, y);
    const a = msOf(kunci === "followup" ? x.next_follow_up_at : x.last_contacted_at);
    const b = msOf(kunci === "followup" ? y.next_follow_up_at : y.last_contacted_at);
    if (a === null && b === null) return byId(x, y);
    if (a === null) return 1;
    if (b === null) return -1;
    return (kunci === "followup" ? a - b : b - a) || byId(x, y);
  });
  return sorted;
}

/**
 * Urutan bawaan antrean agen: (a) follow-up jatuh tempo, paling terlambat
 * di atas; (b) In Progress yang layak dicoba lagi (paling lama tidak
 * disentuh di atas); (c) sisanya, last_contacted_at menurun seperti urutan
 * lama. Tidak bisa dinyatakan sebagai ORDER BY PostgREST biasa, jadi
 * pemanggil menarik kolom urut yang ringan lewat fetchAllRows lalu
 * mengurutkan di sini - baris lengkap cuma diambil untuk 1 halaman.
 * Panggil lampirkanJumlahLog() lebih dulu supaya (b) mengikuti pagar percobaan.
 */
export function urutkanPrioritasKerja<T extends BarisUrutPrioritas>(rows: T[]): T[] {
  const { awalHariMs, akhirHariMs } = kerjakanHariIniBatas();

  const info = rows.map((r) => {
    const fu = msOf(r.next_follow_up_at);
    const lc = msOf(r.last_contacted_at);
    const rank = adalahJatuhTempo(r, akhirHariMs) ? 0 : adalahLayakCobaLagi(r, awalHariMs) ? 1 : 2;
    return { r, fu, lc, rank };
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
