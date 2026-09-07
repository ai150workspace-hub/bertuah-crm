import { ActivityLogTable, type ActivityLogRow } from "@/components/admin/ActivityLogTable";
import { DateRangeFilter } from "@/components/admin/date-range-filter";
import { createClient } from "@/lib/supabase/server";
import { wibDayStartIso, wibDayEndIso, wibDateFromIso, wibTimeFromIso, todayWib } from "@/lib/wib-date";
import { HASIL_PANGGILAN } from "@/lib/call-outcome/catalog";
import { statusWajibCatatan } from "@/lib/call-outcome/derive";

const PAGE_SIZE = 50;
const HASIL_LABEL = new Map(HASIL_PANGGILAN.map((h) => [h.kode, h.label]));

interface JoinedRow {
  id: string;
  timestamp: string;
  hasil: string | null;
  call_notes: string | null;
  agent_id: string;
  users: { name: string } | null;
  contacts: {
    nama: string;
    no_hp: string;
    jenis_kendaraan: string;
    merk_tipe: string | null;
    tahun: number | null;
  } | null;
}

export default async function ActivityLogPage({
  searchParams,
}: PageProps<"/admin/activity-log">) {
  const params = await searchParams;
  const today = todayWib();

  // Default "Hari Ini" (§A) - beda dari Dashboard yang default-nya bulan
  // berjalan. Sengaja tidak dibagi state dengan Dashboard; dua halaman
  // beda tujuan (drilldown harian vs ringkasan periode).
  const fromParam = params.from;
  const toParam = params.to;
  const from = typeof fromParam === "string" ? fromParam : today;
  const to = typeof toParam === "string" ? toParam : today;

  const agentParam = params.agent;
  const hasilParam = params.hasil;
  const hasilGroupParam = params.hasil_group;
  const qParam = params.q;
  const pageParam = params.page;

  const agent = typeof agentParam === "string" ? agentParam : "all";
  const hasil = typeof hasilParam === "string" ? hasilParam : "all";
  // hasil_group="wajib_catatan" datang dari link "Lihat semua di Log
  // Aktivitas" di CatatanLapangan (dashboard) - pre-filter ke 7 status yang
  // wajib catatan. Kalau agen pilih satu status eksplisit dari dropdown,
  // itu yang menang (lihat prioritas query di bawah).
  const hasilGroup = typeof hasilGroupParam === "string" ? hasilGroupParam : "";
  const q = typeof qParam === "string" ? qParam : "";
  const page = typeof pageParam === "string" && Number(pageParam) > 0 ? Number(pageParam) : 1;

  const supabase = await createClient();

  let query = supabase
    .from("call_logs")
    .select(
      "id, timestamp, hasil, call_notes, agent_id, users(name), contacts!inner(nama, no_hp, jenis_kendaraan, merk_tipe, tahun)",
      { count: "exact" }
    )
    .gte("timestamp", wibDayStartIso(from))
    .lte("timestamp", wibDayEndIso(to));

  if (agent !== "all") query = query.eq("agent_id", agent);
  if (hasil !== "all") query = query.eq("hasil", hasil);
  else if (hasilGroup === "wajib_catatan") query = query.in("hasil", statusWajibCatatan());
  if (q.trim()) {
    query = query.or(`nama.ilike.%${q.trim()}%,no_hp.ilike.%${q.trim()}%`, {
      referencedTable: "contacts",
    });
  }

  const rangeFrom = (page - 1) * PAGE_SIZE;
  query = query
    .order("timestamp", { ascending: false })
    .range(rangeFrom, rangeFrom + PAGE_SIZE - 1);

  const [{ data: logRows, count: totalCount }, { data: agentRows }] = await Promise.all([
    query.returns<JoinedRow[]>(),
    // Semua agent (bukan cuma yang aktif) - log lama bisa merujuk agent
    // yang sekarang nonaktif, tetap harus bisa difilter.
    supabase.from("users").select("id, name").eq("role", "agent").order("name"),
  ]);

  const rows: ActivityLogRow[] = (logRows ?? []).map((r) => {
    const kendaraanParts = [
      r.contacts?.jenis_kendaraan,
      r.contacts?.merk_tipe,
      r.contacts?.tahun ? `(${r.contacts.tahun})` : null,
    ].filter(Boolean);

    return {
      id: r.id,
      tanggal: wibDateFromIso(r.timestamp),
      waktu: wibTimeFromIso(r.timestamp),
      agentName: r.users?.name ?? "—",
      namaKonsumen: r.contacts?.nama ?? "—",
      noHp: r.contacts?.no_hp ?? "—",
      kendaraan: kendaraanParts.length > 0 ? kendaraanParts.join(" ") : "—",
      hasilKode: r.hasil,
      hasilLabel: r.hasil ? (HASIL_LABEL.get(r.hasil as never) ?? r.hasil) : "Belum tercatat",
      catatan: r.call_notes,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Log Aktivitas</h1>
        <p className="text-sm text-muted-foreground">
          Rincian setiap panggilan yang tercatat — untuk audit dan export, bukan pengganti
          Dashboard.
        </p>
      </div>

      <DateRangeFilter from={from} to={to} />

      <ActivityLogTable
        rows={rows}
        agents={(agentRows ?? []).map((a) => ({ id: a.id, name: a.name }))}
        agentFilter={agent}
        hasilFilter={hasil}
        hasilGroup={hasilGroup}
        q={q}
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount ?? 0}
        from={from}
        to={to}
      />
    </div>
  );
}
