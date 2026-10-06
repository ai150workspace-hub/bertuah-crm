import { QueueTable } from "@/components/agent/QueueTable";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  CONTACT_SELECT,
  mapDbContact,
  getActiveSlots,
  markPreviousCallFlags,
  ACTIVE_STATUSES,
  kerjakanHariIniOrFilter,
  lampirkanJumlahLog,
  saringKerjakanHariIni,
  urutkanPrioritasKerja,
  urutkanManual,
  type BarisUrutPrioritas,
  type ContactRow,
} from "@/lib/contacts";
import { fetchAllRows } from "@/lib/supabase/pagination";
import { getCapabilities } from "@/lib/telephony/provider";
import { getActiveScriptContent } from "@/lib/scripts";
import { getWaTemplate } from "@/lib/wa-templates";
import { todayWib, wibDayEndIso } from "@/lib/wib-date";

const PAGE_SIZE = 25;
// Semua nilai yang diterima dari parameter URL ?status=. "hariini", "aktif",
// "due", dan "all" bukan nilai kolom status_call, tapi mode filter (gabungan
// beberapa status / tanpa filter sama sekali).
const ACCEPTED_STATUS_VALUES = [
  "hariini",
  "aktif",
  "due",
  "all",
  "Uncalled",
  "In Progress",
  "Warm",
  "Hot Lead",
  "Invalid",
  "Closed",
];
const SORT_KEYS = ["prioritas", "updated", "nama", "status", "followup"] as const;
type SortKey = (typeof SORT_KEYS)[number];

// Kolom ringan untuk jalur "diurutkan/disaring di memori" (lihat bawah).
const KOLOM_RINGAN = "id, nama, status_call, next_follow_up_at, last_contacted_at";

export default async function AgentQueuePage({
  searchParams,
}: PageProps<"/agent/queue">) {
  const params = await searchParams;
  const profile = await getCurrentUser();
  const supabase = await createClient();

  const statusParam = params.status;
  const qParam = params.q;
  const sortParam = params.sort;
  const pageParam = params.page;

  const status =
    typeof statusParam === "string" && ACCEPTED_STATUS_VALUES.includes(statusParam)
      ? statusParam
      // Default "hariini" (Kerjakan Hari Ini: follow-up jatuh tempo + In
      // Progress yang layak dicoba lagi) - bukan "aktif"/"all", supaya yang
      // pertama terlihat adalah pekerjaan yang memang harus dikerjakan
      // hari ini. "aktif" dan "all" tetap bisa dipilih lewat dropdown/URL.
      : "hariini";
  const q = typeof qParam === "string" ? qParam : "";
  // Default "prioritas": follow-up jatuh tempo (paling terlambat di atas),
  // lalu In Progress yang layak dicoba lagi, lalu sisanya seperti urutan
  // lama (last_contacted_at menurun). Opsi sort lain tetap bisa dipilih.
  const sort: SortKey =
    typeof sortParam === "string" && (SORT_KEYS as readonly string[]).includes(sortParam)
      ? (sortParam as SortKey)
      : "prioritas";
  const page = typeof pageParam === "string" && Number(pageParam) > 0 ? Number(pageParam) : 1;

  let contacts: ReturnType<typeof mapDbContact>[] = [];
  let totalCount = 0;
  let hariIniCount = 0;

  if (profile) {
    // Query DAN pagination di level SQL - bukan tarik semua kontak agen lalu
    // saring/urutkan/potong di browser. Halaman ini dulu fetch-semua dengan
    // batas 500 baris; begitu total kontak seorang agen tumbuh lewat itu
    // (terjadi sungguhan di produksi), baris yang kepotong jadi tidak
    // konsisten kalau ada banyak created_at yang identik (satu batch
    // upload/klaim). Dengan query+range di server, TIDAK ADA batas total
    // sama sekali - berapa pun besar riwayat kontak seorang agen, halaman
    // ini cuma pernah menarik 1 halaman (PAGE_SIZE baris) sekaligus.
    //
    // Pengecualian: filter "Kerjakan Hari Ini" (syarat jumlah call log) dan
    // urutan "prioritas" tidak bisa ditulis sebagai filter/ORDER BY biasa,
    // jadi dikerjakan di memori - lihat cabang di bawah.
    const needle = q.trim();
    const cariKontak = (
      columns: string,
      options?: { count?: "exact" },
      mode: string = status,
      denganPencarian = true
    ) => {
      let query = supabase
        .from("contacts")
        .select(columns, options)
        .eq("assigned_to", profile.id);

      if (mode === "hariini") {
        // Penyaringan kasar; syarat jumlah call log menyusul di memori.
        query = query.or(kerjakanHariIniOrFilter());
      } else if (mode === "aktif") {
        query = query.in("status_call", ACTIVE_STATUSES);
      } else if (mode === "due") {
        // Jatuh tempo = follow-up hari ini ATAU sudah terlambat, cuma untuk
        // status yang masih bisa ditindaklanjuti (sama seperti getDueFollowUpCount
        // di lib/contacts.ts - kalau salah satu diubah, ubah juga yang satunya).
        query = query
          .in("status_call", ACTIVE_STATUSES)
          .not("next_follow_up_at", "is", null)
          .lte("next_follow_up_at", wibDayEndIso(todayWib()));
      } else if (mode !== "all") {
        query = query.eq("status_call", mode);
      }
      if (denganPencarian && needle) {
        query = query.or(`nama.ilike.%${needle}%,no_hp.ilike.%${needle}%`);
      }
      return query;
    };

    // Semua kontak yang cocok (kolom ringan, fetchAllRows - aman dari batas
    // 1.000 baris), lengkap dengan jumlah call log untuk kandidat "coba lagi".
    // Cast: kolom select di cariKontak() bukan string literal, jadi
    // supabase-js tidak bisa menurunkan tipe barisnya sendiri.
    const muatBaris = async (mode: string, denganPencarian: boolean) =>
      lampirkanJumlahLog(
        await fetchAllRows<BarisUrutPrioritas>(
          (f, t) =>
            cariKontak(KOLOM_RINGAN, undefined, mode, denganPencarian)
              .order("id", { ascending: true })
              .range(f, t) as unknown as PromiseLike<{
              data: BarisUrutPrioritas[] | null;
              error: unknown;
            }>
        )
      );

    const from = (page - 1) * PAGE_SIZE;
    let rawContacts: ReturnType<typeof mapDbContact>[] = [];

    if (status === "hariini" || sort === "prioritas") {
      let baris = await muatBaris(status, true);
      if (status === "hariini") {
        baris = saringKerjakanHariIni(baris);
        // Label filter "Kerjakan Hari Ini (N)" sengaja TIDAK ikut pencarian q,
        // supaya yang tampil adalah beban kerja agen sebenarnya.
        hariIniCount = needle
          ? saringKerjakanHariIni(await muatBaris("hariini", false)).length
          : baris.length;
      } else {
        hariIniCount = saringKerjakanHariIni(await muatBaris("hariini", false)).length;
      }

      const sorted =
        sort === "prioritas" ? urutkanPrioritasKerja(baris) : urutkanManual(baris, sort);
      totalCount = sorted.length;
      // Baris lengkap cuma untuk 1 halaman.
      const pageIds = sorted.slice(from, from + PAGE_SIZE).map((r) => r.id);
      if (pageIds.length > 0) {
        const { data: pageRows } = await supabase
          .from("contacts")
          .select(CONTACT_SELECT)
          .in("id", pageIds);
        const byId = new Map(((pageRows ?? []) as ContactRow[]).map((r) => [r.id, r]));
        rawContacts = pageIds
          .map((id) => byId.get(id))
          .filter((r): r is ContactRow => r !== undefined)
          .map(mapDbContact);
      }
    } else {
      let query = cariKontak(CONTACT_SELECT, { count: "exact" });

      if (sort === "nama") {
        query = query.order("nama", { ascending: true });
      } else if (sort === "status") {
        query = query.order("status_call", { ascending: true });
      } else if (sort === "followup") {
        // Belum ada jadwal -> paling belakang (bukan prioritas).
        query = query.order("next_follow_up_at", { ascending: true, nullsFirst: false });
      } else {
        // "updated" - belum pernah ditelepon -> paling belakang.
        query = query.order("last_contacted_at", { ascending: false, nullsFirst: false });
      }
      // Tie-breaker stabil - wajib ada supaya urutan baris yang nilainya
      // identik di kolom sort utama (misal satu batch upload/klaim dengan
      // timestamp sama persis) konsisten antar-halaman, bukan berubah-ubah.
      query = query.order("id", { ascending: true });
      query = query.range(from, from + PAGE_SIZE - 1);

      const [{ data: contactRows, count }, hariIniBaris] = await Promise.all([
        query,
        muatBaris("hariini", false),
      ]);
      hariIniCount = saringKerjakanHariIni(hariIniBaris).length;
      rawContacts = ((contactRows ?? []) as unknown as ContactRow[]).map(mapDbContact);
      totalCount = count ?? 0;
    }

    contacts = await markPreviousCallFlags(rawContacts, profile.id);
  }

  // 4 operasi independen (tidak saling butuh hasil satu sama lain) - jalan
  // bareng, bukan berurutan.
  const [capabilities, activeSlots, scripts, initialFollowupTemplate] = await Promise.all([
    getCapabilities(),
    profile ? getActiveSlots(supabase, profile.id) : Promise.resolve(null),
    getActiveScriptContent(),
    getWaTemplate("initial_followup"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Antrean Saya</h1>
        <p className="text-sm text-muted-foreground">
          Semua lead yang sedang ditugaskan ke kamu.
        </p>
      </div>

      <QueueTable
        contacts={contacts}
        capabilities={capabilities}
        activeSlots={activeSlots}
        agentStatus={profile?.agentStatus ?? undefined}
        totalCount={totalCount}
        hariIniCount={hariIniCount}
        q={q}
        statusFilter={status}
        sortKey={sort}
        page={page}
        pageSize={PAGE_SIZE}
        scripts={scripts}
        agentId={profile?.id}
        agentCreatedAt={profile?.createdAt}
        initialFollowupTemplate={initialFollowupTemplate?.templateText ?? null}
      />
    </div>
  );
}
