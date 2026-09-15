import { Database, PhoneCall, Flame } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DateRangeFilter } from "@/components/admin/date-range-filter";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  AgentsReportTable,
  type AgentReportRow,
  type AgentFunnelStage,
  type AgentCallDistribution,
  type AgentRecentCall,
} from "@/components/admin/agents-report-table";
import type { AgentStatus, HeldContact, OtherAgentOption } from "@/components/admin/AgentStatusControls";
import { DatabaseHealthCard, type DatabaseHealthData } from "@/components/admin/database-health-card";
import { AgentsExportButton } from "@/components/admin/agents-export-button";
import { CreateAgentDialog } from "@/components/admin/CreateAgentDialog";
import { CreateAdminDialog } from "@/components/admin/CreateAdminDialog";
import { AdminAccountsCard, type AdminAccountRow } from "@/components/admin/AdminAccountsCard";
import { JamEfektifCard, type JamEfektifAgentData, type JamEfektifHourRow } from "@/components/admin/JamEfektifCard";
import { JadwalJauhCard, type JadwalJauhRow, type JadwalJauhAgentCount } from "@/components/admin/JadwalJauhCard";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { getCurrentUser } from "@/lib/auth";
import { formatPercent } from "@/lib/format";
import {
  wibDayStartIso,
  wibDayEndIso,
  todayWib,
  startOfMonthWib,
  addDaysWib,
  wibDateFromIso,
  wibHourFromIso,
  wibTimeFromIso,
} from "@/lib/wib-date";
import { adalahRpc } from "@/lib/call-outcome/derive";
import { HASIL_PANGGILAN, type KodeHasil } from "@/lib/call-outcome/catalog";

const HASIL_LABEL = new Map(HASIL_PANGGILAN.map((h) => [h.kode, h.label]));
const HASIL_STATUS_KONTAK = new Map(HASIL_PANGGILAN.map((h) => [h.kode, h.statusKontak]));

interface ContactRow {
  id: string;
  nama: string;
  no_hp: string;
  assigned_to: string | null;
  status_call: string;
  next_follow_up_at: string | null;
  alasan_jadwal_panjang: string | null;
}

interface CallLogPeriodeRow {
  agent_id: string;
  level_1: string;
  hasil: string | null;
  timestamp: string;
  contact_id: string;
}

interface CallLogRecentRow {
  agent_id: string;
  timestamp: string;
  hasil: string | null;
  call_duration: number | null;
  contacts: { nama: string } | { nama: string }[] | null;
}

interface ApplicationRow {
  agent_id: string;
  status_aplikasi: string;
  nominal_pencairan: number | null;
  created_at: string;
  date_disbursed: string | null;
}

function contactName(c: CallLogRecentRow["contacts"]): string {
  if (!c) return "—";
  return Array.isArray(c) ? (c[0]?.nama ?? "—") : c.nama;
}

export default async function AdminAgentsPage({
  searchParams,
}: PageProps<"/admin/agents">) {
  const params = await searchParams;
  const today = todayWib();
  const fromParam = params.from;
  const toParam = params.to;
  const from = typeof fromParam === "string" ? fromParam : startOfMonthWib(today);
  const to = typeof toParam === "string" ? toParam : today;
  const startIso = wibDayStartIso(from);
  const endIso = wibDayEndIso(to);

  const supabase = await createClient();
  const profile = await getCurrentUser();

  // Daftar akun admin cuma perlu di-fetch untuk admin penuh - admin
  // monitoring tidak boleh lihat/kelola admin lain sama sekali (bukan cuma
  // tombol reset password-nya yang disembunyikan).
  const adminAccounts: AdminAccountRow[] = profile?.isRestrictedAdmin
    ? []
    : await supabase
        .from("users")
        .select("id, name, email, is_restricted_admin")
        .eq("role", "admin")
        .order("name")
        .then(({ data }) =>
          (data ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            email: a.email,
            isRestricted: Boolean(a.is_restricted_admin),
          }))
        );

  const [
    [{ data: agentRows }, { data: periodeLogRows }, { data: recentLogRows }, { data: appRows }],
    contacts,
  ] = await Promise.all([
    Promise.all([
      supabase
        .from("users")
        .select(
          "id, name, kapasitas_data, agent_status, pause_started_at, pause_max_days, recycled_warm_taken_today, recycled_inprogress_taken_today, recycled_counter_date"
        )
        .eq("role", "agent")
        .order("name"),
      supabase
        .from("call_logs")
        .select("agent_id, level_1, hasil, timestamp, contact_id")
        .gte("timestamp", startIso)
        .lte("timestamp", endIso),
      // Cukup untuk "last activity" + 5 call log terakhir tiap agen di skala
      // tim sekarang (lihat catatan di getActiveSlots-style query lain) -
      // diturunkan dari 1500 supaya payload lebih kecil setiap kunjungan.
      supabase
        .from("call_logs")
        .select("agent_id, timestamp, hasil, call_duration, contacts(nama)")
        .order("timestamp", { ascending: false })
        .limit(500),
      supabase
        .from("applications")
        .select("agent_id, status_aplikasi, nominal_pencairan, created_at, date_disbursed"),
    ]),
    // fetchAllRows, bukan .select() polos - contacts sudah 1.404 baris,
    // lewat batas diam-diam 1.000 baris PostgREST (lihat
    // lib/supabase/pagination.ts). Health Database & seluruh kolom per-agen
    // di bawah diturunkan dari array ini.
    fetchAllRows<ContactRow>((from, to) =>
      supabase
        .from("contacts")
        .select("id, nama, no_hp, assigned_to, status_call, next_follow_up_at, alasan_jadwal_panjang")
        .range(from, to)
    ),
  ]);

  const agents = agentRows ?? [];
  const periodeLogs = (periodeLogRows ?? []) as CallLogPeriodeRow[];
  const recentLogs = (recentLogRows ?? []) as unknown as CallLogRecentRow[];
  const apps = (appRows ?? []) as ApplicationRow[];

  // ---- Section 1: ringkasan agregat seluruh tim ----
  const assignedNonInvalid = contacts.filter((c) => c.assigned_to !== null && c.status_call !== "Invalid");
  const totalDataDiAssign = assignedNonInvalid.length;
  // assigned_to !== null wajib ada di sini juga, sama seperti totalDataDiAssign
  // di atas - tanpa itu, kontak yang sudah dikerjakan lalu dilepas ke pool
  // (cron auto-reshuffle) tetap terhitung di pembilang tapi hilang dari
  // penyebut begitu terlepas, sehingga persentasenya bisa lewat 100%.
  const workedAll = contacts.filter(
    (c) => c.assigned_to !== null && c.status_call !== "Uncalled" && c.status_call !== "Invalid"
  );
  const utilisasiDatabasePercent = totalDataDiAssign > 0 ? (workedAll.length / totalDataDiAssign) * 100 : 0;

  const totalCallPeriode = periodeLogs.length;
  // Catatan: "Connected" dihitung via adalahRpc(hasil), bukan level_1='CONNECTED' mentah -
  // level_1 lama menghitung busy tone/mailbox sebagai "tersambung" (lihat komentar di
  // lib/call-outcome/catalog.ts), jadi Contact Rate di sini disamakan dengan definisi
  // yang sudah dipakai di dashboard utama.
  const connectedPeriode = periodeLogs.filter((l) => l.hasil && adalahRpc(l.hasil as KodeHasil)).length;
  const overallContactRate = totalCallPeriode > 0 ? (connectedPeriode / totalCallPeriode) * 100 : 0;

  const nonUncalledInvalid = contacts.filter((c) => c.status_call !== "Uncalled" && c.status_call !== "Invalid");
  const hotLeadAll = contacts.filter((c) => c.status_call === "Hot Lead").length;
  const hotLeadRate = nonUncalledInvalid.length > 0 ? (hotLeadAll / nonUncalledInvalid.length) * 100 : 0;

  // ---- Maps per agen (satu pass, tanpa query berulang) ----
  // Invalid dikecualikan di sini supaya "Data Di-assign" dkk. konsisten
  // dengan definisi Section 1 (COUNT ... AND status_call != 'Invalid').
  const contactsByAgent = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    if (!c.assigned_to || c.status_call === "Invalid") continue;
    const arr = contactsByAgent.get(c.assigned_to) ?? [];
    arr.push(c);
    contactsByAgent.set(c.assigned_to, arr);
  }

  const periodeLogsByAgent = new Map<string, CallLogPeriodeRow[]>();
  for (const l of periodeLogs) {
    const arr = periodeLogsByAgent.get(l.agent_id) ?? [];
    arr.push(l);
    periodeLogsByAgent.set(l.agent_id, arr);
  }

  // ---- Jam Efektif Menelepon - diturunkan dari periodeLogs yang sama di
  // atas, tidak ada query baru. Lihat components/admin/JamEfektifCard.tsx. ----
  // Jendela "mulai tepat waktu" (aturan #1) - HH:mm WIB, dibandingkan sebagai
  // teks lewat wibTimeFromIso() (sudah dipad 2 digit, aman dibandingkan
  // leksikografis). Cuma dipakai kartu "Mulai Tepat Waktu" - batang per jam
  // dan 3 kartu lain TIDAK memakai konstanta ini.
  const JAM_MULAI_TEPAT_AWAL = "09:00";
  const JAM_MULAI_TEPAT_AKHIR = "09:30";
  // Aturan jam baru berlaku mulai tanggal ini - hari SEBELUMNYA dikecualikan
  // dari penilaian kartu "Mulai Tepat Waktu" saja.
  const ATURAN_JAM_BERLAKU_SEJAK = "2026-09-16";

  const jamEfektifByAgent: JamEfektifAgentData[] = agents.map((agent) => {
    const logs = periodeLogsByAgent.get(agent.id) ?? [];
    const totalCall = logs.length;

    if (totalCall === 0) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        totalCall: 0,
        hourly: [],
        avgBicaraPercent: 0,
        hariDinilai: 0,
        hariTepatWaktu: 0,
        hariTerlaluPagi: 0,
        hariTerlambat: 0,
        jamEmasPercent: 0,
        rataRataPercobaan: 0,
        panggilanSore: 0,
      };
    }

    const bicaraTotal = logs.filter((l) => l.hasil && adalahRpc(l.hasil as KodeHasil)).length;
    const avgBicaraPercent = (bicaraTotal / totalCall) * 100;

    // a) sebaran per jam (0-23) - cuma jam yang ada panggilannya yang disimpan.
    const perJam = new Map<number, { total: number; bicara: number }>();
    for (const l of logs) {
      const jam = wibHourFromIso(l.timestamp);
      const cur = perJam.get(jam) ?? { total: 0, bicara: 0 };
      cur.total += 1;
      if (l.hasil && adalahRpc(l.hasil as KodeHasil)) cur.bicara += 1;
      perJam.set(jam, cur);
    }
    const hourly: JamEfektifHourRow[] = Array.from(perJam.entries())
      .map(([hour, v]) => ({
        hour,
        total: v.total,
        bicara: v.bicara,
        bicaraPercent: (v.bicara / v.total) * 100,
      }))
      .sort((x, y) => x.hour - y.hour);

    // b) jam mulai - panggilan paling awal tiap hari kalender WIB, cuma
    // dinilai sejak ATURAN_JAM_BERLAKU_SEJAK. Tiga keadaan berdasarkan jam
    // mulai itu (HH:mm WIB): sebelum JAM_MULAI_TEPAT_AWAL -> terlalu pagi;
    // di antara AWAL dan AKHIR (inklusif) -> tepat waktu; setelah AKHIR ->
    // terlambat.
    const earliestByDay = new Map<string, string>();
    for (const l of logs) {
      const hari = wibDateFromIso(l.timestamp);
      const cur = earliestByDay.get(hari);
      if (!cur || new Date(l.timestamp).getTime() < new Date(cur).getTime()) {
        earliestByDay.set(hari, l.timestamp);
      }
    }
    let hariDinilai = 0;
    let hariTepatWaktu = 0;
    let hariTerlaluPagi = 0;
    let hariTerlambat = 0;
    for (const [hari, ts] of earliestByDay.entries()) {
      if (hari < ATURAN_JAM_BERLAKU_SEJAK) continue;
      hariDinilai += 1;
      const jamMulai = wibTimeFromIso(ts);
      if (jamMulai < JAM_MULAI_TEPAT_AWAL) hariTerlaluPagi += 1;
      else if (jamMulai <= JAM_MULAI_TEPAT_AKHIR) hariTepatWaktu += 1;
      else hariTerlambat += 1;
    }

    // c) porsi jam emas (11:00-13:59 WIB) - aturan #2.
    const jamEmasCount = logs.filter((l) => {
      const j = wibHourFromIso(l.timestamp);
      return j >= 11 && j <= 13;
    }).length;
    const jamEmasPercent = (jamEmasCount / totalCall) * 100;

    // d) rata-rata percobaan - total panggilan dibagi kontak unik. ~1,0
    // berarti nyaris tidak ada telepon ulang (aturan #3 dilanggar).
    const kontakUnik = new Set(logs.map((l) => l.contact_id)).size;
    const rataRataPercobaan = kontakUnik > 0 ? totalCall / kontakUnik : 0;

    // e) panggilan sore (16:00-17:59 WIB) - aturan #4.
    const panggilanSore = logs.filter((l) => {
      const j = wibHourFromIso(l.timestamp);
      return j === 16 || j === 17;
    }).length;

    return {
      agentId: agent.id,
      agentName: agent.name,
      totalCall,
      hourly,
      avgBicaraPercent,
      hariDinilai,
      hariTepatWaktu,
      hariTerlaluPagi,
      hariTerlambat,
      jamEmasPercent,
      rataRataPercobaan,
      panggilanSore,
    };
  });

  // ---- Jadwal Follow-up Lebih dari 7 Hari - diturunkan dari contacts yang
  // sudah ditarik lewat fetchAllRows di atas, tidak ada query baru. Lihat
  // components/admin/JadwalJauhCard.tsx dan migrasi 0026. ----
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));
  const batasJadwalJauh = addDaysWib(today, 7);
  const STATUS_JADWAL_JAUH = new Set(["Warm", "In Progress", "Inbound"]);
  const jadwalJauhRows: JadwalJauhRow[] = contacts
    .filter(
      (c) =>
        c.next_follow_up_at !== null &&
        wibDateFromIso(c.next_follow_up_at) > batasJadwalJauh &&
        STATUS_JADWAL_JAUH.has(c.status_call) &&
        c.assigned_to !== null
    )
    .map((c) => ({
      contactId: c.id,
      namaNasabah: c.nama,
      agentName: agentNameById.get(c.assigned_to!) ?? "—",
      tanggalFollowupWib: wibDateFromIso(c.next_follow_up_at!),
      alasan: c.alasan_jadwal_panjang,
    }))
    .sort((x, y) => (x.tanggalFollowupWib < y.tanggalFollowupWib ? 1 : -1));

  const jadwalJauhCountByAgent = new Map<string, number>();
  for (const r of jadwalJauhRows) {
    jadwalJauhCountByAgent.set(r.agentName, (jadwalJauhCountByAgent.get(r.agentName) ?? 0) + 1);
  }
  const jadwalJauhAgentCounts: JadwalJauhAgentCount[] = Array.from(jadwalJauhCountByAgent.entries())
    .map(([agentName, count]) => ({ agentName, count }))
    .sort((x, y) => y.count - x.count);

  const recentByAgent = new Map<string, CallLogRecentRow[]>();
  for (const l of recentLogs) {
    const arr = recentByAgent.get(l.agent_id) ?? [];
    arr.push(l);
    recentByAgent.set(l.agent_id, arr);
  }

  const appsCreatedByAgent = new Map<string, number>();
  for (const a of apps) {
    if (a.created_at >= startIso && a.created_at <= endIso) {
      appsCreatedByAgent.set(a.agent_id, (appsCreatedByAgent.get(a.agent_id) ?? 0) + 1);
    }
  }

  const disbursedByAgent = new Map<string, { count: number; total: number }>();
  for (const a of apps) {
    if (a.status_aplikasi !== "Disbursed" || !a.date_disbursed) continue;
    if (a.date_disbursed < from || a.date_disbursed > to) continue;
    const cur = disbursedByAgent.get(a.agent_id) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += a.nominal_pencairan ?? 0;
    disbursedByAgent.set(a.agent_id, cur);
  }

  const appsAllTimeByAgent = new Map<string, { total: number; disbursed: number }>();
  for (const a of apps) {
    const cur = appsAllTimeByAgent.get(a.agent_id) ?? { total: 0, disbursed: 0 };
    cur.total += 1;
    if (a.status_aplikasi === "Disbursed") cur.disbursed += 1;
    appsAllTimeByAgent.set(a.agent_id, cur);
  }

  const rows: AgentReportRow[] = agents.map((agent) => {
    const agentContacts = contactsByAgent.get(agent.id) ?? [];
    const dataDiAssign = agentContacts.length;
    const sudahDikerjakan = agentContacts.filter(
      (c) => c.status_call !== "Uncalled" && c.status_call !== "Invalid"
    ).length;
    const uncalledCount = agentContacts.filter((c) => c.status_call === "Uncalled").length;
    const utilisasiPercent = dataDiAssign > 0 ? (sudahDikerjakan / dataDiAssign) * 100 : null;

    const agentPeriodeLogs = periodeLogsByAgent.get(agent.id) ?? [];
    const totalCall = agentPeriodeLogs.length;
    const connected = agentPeriodeLogs.filter((l) => l.hasil && adalahRpc(l.hasil as KodeHasil)).length;
    const contactRatePercent = totalCall > 0 ? (connected / totalCall) * 100 : null;

    const hotLead = agentContacts.filter((c) => c.status_call === "Hot Lead").length;
    const warm = agentContacts.filter((c) => c.status_call === "Warm").length;
    const closed = agentContacts.filter((c) => c.status_call === "Closed").length;
    const conversionRatePercent = sudahDikerjakan > 0 ? (hotLead / sudahDikerjakan) * 100 : null;

    const aplikasiMasuk = appsCreatedByAgent.get(agent.id) ?? 0;
    const disb = disbursedByAgent.get(agent.id) ?? { count: 0, total: 0 };

    const agentRecent = recentByAgent.get(agent.id) ?? [];
    const lastActivity = agentRecent.length > 0 ? (agentRecent[0]?.timestamp ?? null) : null;
    const recentCalls: AgentRecentCall[] = agentRecent.slice(0, 5).map((l) => ({
      timestamp: l.timestamp,
      contactName: contactName(l.contacts),
      hasilLabel: l.hasil ? (HASIL_LABEL.get(l.hasil as KodeHasil) ?? l.hasil) : "—",
      durationSec: l.call_duration,
    }));

    const callDistribution: AgentCallDistribution = {
      connected: 0,
      unconnected: 0,
      hotLead: 0,
      warm: 0,
      inProgress: 0,
      closed: 0,
    };
    for (const l of agentPeriodeLogs) {
      if (l.level_1 === "CONNECTED") callDistribution.connected += 1;
      else callDistribution.unconnected += 1;
      if (l.hasil) {
        const sk = HASIL_STATUS_KONTAK.get(l.hasil as KodeHasil);
        if (sk === "Hot Lead") callDistribution.hotLead += 1;
        else if (sk === "Warm") callDistribution.warm += 1;
        else if (sk === "In Progress") callDistribution.inProgress += 1;
        else if (sk === "Closed") callDistribution.closed += 1;
      }
    }

    const appsAgent = appsAllTimeByAgent.get(agent.id) ?? { total: 0, disbursed: 0 };
    const inProgressCount = agentContacts.filter((c) => c.status_call === "In Progress").length;
    // Slot aktif (dipakai kapasitas_data) = Uncalled + In Progress + Warm.
    // Invalid & Hot Lead tidak dihitung - lihat 0010_active_slot_capacity.sql.
    const activeSlotCount = uncalledCount + inProgressCount + warm;
    const invalidCount = contacts.filter(
      (c) => c.assigned_to === agent.id && c.status_call === "Invalid"
    ).length;
    const funnel: AgentFunnelStage[] = [
      { label: "Uncalled", value: uncalledCount },
      { label: "In Progress", value: inProgressCount },
      { label: "Warm", value: warm },
      { label: "Hot Lead", value: hotLead },
      { label: "Aplikasi", value: appsAgent.total },
      { label: "Disbursed", value: appsAgent.disbursed },
    ];

    // Counter recycled harian baru di-reset di database saat agent benar-
    // benar klik "Ambil Data Baru" di hari itu (atau lewat cron backup
    // tengah malam) - lihat 0014_capacity_recycled_cap.sql. Kalau belum
    // ke-reset (recycled_counter_date bukan hari ini), tampilkan 0 di sini
    // supaya admin tidak lihat sisa angka kemarin sebelum sempat direset.
    const recycledIsToday = agent.recycled_counter_date === today;
    const recycledWarmToday = recycledIsToday ? (agent.recycled_warm_taken_today ?? 0) : 0;
    const recycledInprogToday = recycledIsToday ? (agent.recycled_inprogress_taken_today ?? 0) : 0;

    return {
      agentId: agent.id,
      agentName: agent.name,
      lastActivity,
      dataDiAssign,
      sudahDikerjakan,
      uncalledSisa: uncalledCount,
      activeSlotCount,
      kapasitas: agent.kapasitas_data,
      invalidCount,
      utilisasiPercent,
      totalCall,
      connected,
      contactRatePercent,
      hotLead,
      warm,
      closed,
      conversionRatePercent,
      aplikasiMasuk,
      disbursedCount: disb.count,
      totalPencairan: disb.total,
      funnel,
      callDistribution,
      recentCalls,
      agentStatus: agent.agent_status as AgentStatus,
      pauseStartedAt: agent.pause_started_at,
      pauseMaxDays: agent.pause_max_days,
      recycledWarmToday,
      recycledInprogToday,
      heldContacts: [],
      otherAgents: [],
    };
  });

  // Kontak ditahan (untuk agen Pause) & daftar agen aktif lain (untuk
  // dropdown "Assign ke Agen Lain") - ditempel langsung ke tiap row
  // supaya tidak perlu lewatkan Map terpisah ke client component.
  const rowsWithStatus = rows.map((row) => {
    const heldContacts: HeldContact[] =
      row.agentStatus === "pause"
        ? (contactsByAgent.get(row.agentId) ?? [])
            .filter((c) => c.status_call !== "Closed")
            .map((c) => ({ id: c.id, nama: c.nama, noHp: c.no_hp, statusCall: c.status_call }))
        : [];
    const otherAgents: OtherAgentOption[] = rows
      .filter((r) => r.agentId !== row.agentId && r.agentStatus === "active")
      .map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        used: r.activeSlotCount,
        capacity: r.kapasitas,
      }));
    return { ...row, heldContacts, otherAgents };
  });

  // ---- Section 4: Health Database Keseluruhan (semua contacts, semua status) ----
  const statusOrder: { label: string; status: string; colorClassName: string }[] = [
    { label: "Hot Lead", status: "Hot Lead", colorClassName: "bg-hot" },
    { label: "Warm", status: "Warm", colorClassName: "bg-warning" },
    { label: "In Progress", status: "In Progress", colorClassName: "bg-primary" },
    { label: "Uncalled", status: "Uncalled", colorClassName: "bg-muted-foreground/40" },
    { label: "Closed", status: "Closed", colorClassName: "bg-muted-foreground/70" },
    { label: "Invalid", status: "Invalid", colorClassName: "bg-destructive/50" },
  ];
  const healthCounts = new Map<string, number>();
  for (const c of contacts) {
    healthCounts.set(c.status_call, (healthCounts.get(c.status_call) ?? 0) + 1);
  }
  const health: DatabaseHealthData = {
    segments: statusOrder.map((s) => ({
      label: s.label,
      count: healthCounts.get(s.status) ?? 0,
      colorClassName: s.colorClassName,
    })),
    total: contacts.length,
    touched: contacts.length - (healthCounts.get("Uncalled") ?? 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Report performa dan aktivitas tiap agen telemarketing.
        </p>
      </div>

      {!profile?.isRestrictedAdmin && profile && (
        <AdminAccountsCard admins={adminAccounts} currentUserId={profile.id} />
      )}

      <DateRangeFilter from={from} to={to} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Data Di-assign" value={String(totalDataDiAssign)} icon={Database} />
        <Card className="gap-0 py-0">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Utilisasi Database</div>
            <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
              {formatPercent(utilisasiDatabasePercent)}
            </div>
            <Progress value={Math.min(100, Math.max(0, utilisasiDatabasePercent))} className="mt-2" />
            <div className="mt-1.5 text-xs text-muted-foreground">
              dari total data ter-assign sudah dikerjakan
            </div>
          </CardContent>
        </Card>
        <KpiCard
          label="Overall Contact Rate"
          value={formatPercent(overallContactRate)}
          icon={PhoneCall}
          hint="periode terpilih"
        />
        <KpiCard label="Hot Lead Rate" value={formatPercent(hotLeadRate)} icon={Flame} tone="hot" />
      </div>

      <JamEfektifCard agents={jamEfektifByAgent} />

      <JadwalJauhCard rows={jadwalJauhRows} agentCounts={jadwalJauhAgentCounts} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Performa per Agen</h2>
        <div className="flex items-center gap-2">
          <CreateAgentDialog />
          {!profile?.isRestrictedAdmin && <CreateAdminDialog />}
          {!profile?.isRestrictedAdmin && (
            <AgentsExportButton rows={rows} health={health} periodeTo={to} />
          )}
        </div>
      </div>

      <AgentsReportTable rows={rowsWithStatus} />

      <DatabaseHealthCard data={health} />
    </div>
  );
}
