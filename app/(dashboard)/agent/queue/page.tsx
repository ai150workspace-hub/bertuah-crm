import { QueueTable } from "@/components/agent/QueueTable";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  CONTACT_SELECT,
  mapDbContact,
  getActiveSlots,
  markPreviousCallFlags,
  type ContactRow,
} from "@/lib/contacts";
import { getCapabilities } from "@/lib/telephony/provider";
import { getActiveScriptContent } from "@/lib/scripts";
import { getWaTemplate } from "@/lib/wa-templates";

const PAGE_SIZE = 25;
const FILTERABLE_STATUSES = ["Uncalled", "In Progress", "Warm", "Hot Lead"];
const SORT_KEYS = ["updated", "nama", "status", "followup"] as const;
type SortKey = (typeof SORT_KEYS)[number];

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
    typeof statusParam === "string" && FILTERABLE_STATUSES.includes(statusParam)
      ? statusParam
      : "all";
  const q = typeof qParam === "string" ? qParam : "";
  const sort: SortKey =
    typeof sortParam === "string" && (SORT_KEYS as readonly string[]).includes(sortParam)
      ? (sortParam as SortKey)
      : "updated";
  const page = typeof pageParam === "string" && Number(pageParam) > 0 ? Number(pageParam) : 1;

  let contacts: ReturnType<typeof mapDbContact>[] = [];
  let totalCount = 0;

  if (profile) {
    // Query DAN pagination di level SQL - bukan tarik semua kontak agen lalu
    // saring/urutkan/potong di browser. Halaman ini dulu fetch-semua dengan
    // batas 500 baris; begitu total kontak seorang agen tumbuh lewat itu
    // (terjadi sungguhan di produksi), baris yang kepotong jadi tidak
    // konsisten kalau ada banyak created_at yang identik (satu batch
        // upload/klaim). Dengan query+range di server, TIDAK ADA batas total
    // sama sekali - berapa pun besar riwayat kontak seorang agen, halaman
    // ini cuma pernah menarik 1 halaman (PAGE_SIZE baris) sekaligus.
    let query = supabase
      .from("contacts")
      .select(CONTACT_SELECT, { count: "exact" })
      .eq("assigned_to", profile.id);

    if (status !== "all") query = query.eq("status_call", status);
    if (q.trim()) {
      const needle = q.trim();
      query = query.or(`nama.ilike.%${needle}%,no_hp.ilike.%${needle}%`);
    }

    if (sort === "nama") {
      query = query.order("nama", { ascending: true });
    } else if (sort === "status") {
      query = query.order("status_call", { ascending: true });
    } else if (sort === "followup") {
      // Belum ada jadwal -> paling belakang (bukan prioritas).
      query = query.order("next_follow_up_at", { ascending: true, nullsFirst: false });
    } else {
      // "updated" (default) - belum pernah ditelepon -> paling belakang.
      query = query.order("last_contacted_at", { ascending: false, nullsFirst: false });
    }
    // Tie-breaker stabil - wajib ada supaya urutan baris yang nilainya
    // identik di kolom sort utama (misal satu batch upload/klaim dengan
    // timestamp sama persis) konsisten antar-halaman, bukan berubah-ubah.
    query = query.order("id", { ascending: true });

    const from = (page - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data: contactRows, count } = await query;
    const rawContacts = ((contactRows ?? []) as ContactRow[]).map(mapDbContact);
    contacts = await markPreviousCallFlags(rawContacts, profile.id);
    totalCount = count ?? 0;
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
