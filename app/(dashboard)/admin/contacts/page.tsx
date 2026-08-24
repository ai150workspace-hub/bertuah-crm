import { Users, UserX, ShieldOff } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ContactsFilterBar } from "@/components/admin/contacts/contacts-filter-bar";
import { ContactsTable, type AdminContactRow } from "@/components/admin/contacts/contacts-table";
import { ContactsPagination } from "@/components/admin/contacts/contacts-pagination";
import { DncSheetTrigger, type DncRow } from "@/components/admin/contacts/dnc-sheet";
import { createClient } from "@/lib/supabase/server";
import { getAgentCapacitiesBulk } from "@/lib/contacts";

const PAGE_SIZE = 50;
const DEFAULT_STATUSES = ["Uncalled", "Hot Lead", "Warm", "In Progress"];
const ALL_STATUSES = ["Uncalled", "Hot Lead", "Warm", "In Progress", "Closed", "Invalid"];

export default async function AdminContactsPage({
  searchParams,
}: PageProps<"/admin/contacts">) {
  const params = await searchParams;
  const statusParam = params.status;
  const assignedParam = params.assigned;
  const qParam = params.q;
  const pageParam = params.page;

  const statuses =
    typeof statusParam === "string" && statusParam.length > 0
      ? statusParam.split(",")
      : DEFAULT_STATUSES;
  const assigned = typeof assignedParam === "string" ? assignedParam : "all";
  const q = typeof qParam === "string" ? qParam : "";
  const page = typeof pageParam === "string" && Number(pageParam) > 0 ? Number(pageParam) : 1;

  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("id, nama, no_hp, jenis_kendaraan, status_call, assigned_to, updated_at", {
      count: "exact",
    });

  if (statuses.length > 0 && statuses.length < ALL_STATUSES.length) {
    query = query.in("status_call", statuses);
  }
  if (assigned === "unassigned") {
    query = query.is("assigned_to", null);
  } else if (assigned !== "all") {
    query = query.eq("assigned_to", assigned);
  }
  if (q) {
    query = query.or(`nama.ilike.%${q}%,no_hp.ilike.%${q}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  query = query.order("updated_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);

  // 5 query independen (tidak saling butuh hasil satu sama lain) - jalan
  // bareng, bukan berurutan.
  const [
    { data: agentRows },
    { data: contactRows, count: totalCount },
    { count: totalAktif },
    { count: unassignedCount },
    { data: dncData, count: dncCount },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, kapasitas_data")
      .eq("role", "agent")
      .eq("is_active", true)
      .order("name"),
    query,
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .not("status_call", "in", "(Invalid,Closed)"),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .is("assigned_to", null)
      .neq("status_call", "Invalid"),
    supabase
      .from("do_not_contact")
      .select("no_hp, alasan, created_at", { count: "exact" })
      .order("created_at", { ascending: false }),
  ]);

  const agents = agentRows ?? [];
  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

  // Kapasitas terpakai (active slots: Uncalled + In Progress + Warm) tiap
  // agent - dipakai dropdown Assign. Invalid/Hot Lead/Closed tidak dihitung
  // (lihat 0010_active_slot_capacity.sql). Butuh daftar agent di atas dulu,
  // jadi baru jalan setelah wave pertama selesai.
  const agentCapacities = await getAgentCapacitiesBulk(supabase, agents);

  const rows: AdminContactRow[] = (contactRows ?? []).map((c) => ({
    id: c.id,
    nama: c.nama,
    noHp: c.no_hp,
    jenisKendaraan: c.jenis_kendaraan,
    statusCall: c.status_call,
    assignedTo: c.assigned_to,
    assignedToName: c.assigned_to ? (agentNameMap.get(c.assigned_to) ?? "—") : null,
    updatedAt: c.updated_at,
  }));

  const dncRows: DncRow[] = (dncData ?? []).map((d) => ({
    noHp: d.no_hp,
    alasan: d.alasan,
    createdAt: d.created_at,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Kelola seluruh database kontak — reassign, lepas ke pool, kelola Do Not Contact.
          </p>
        </div>
        <DncSheetTrigger rows={dncRows} count={dncCount ?? 0} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label="Total Kontak Aktif" value={String(totalAktif ?? 0)} icon={Users} />
        <KpiCard label="Unassigned" value={String(unassignedCount ?? 0)} icon={UserX} tone="hot" />
        <KpiCard label="Do Not Contact" value={String(dncCount ?? 0)} icon={ShieldOff} />
      </div>

      <ContactsFilterBar
        statuses={statuses}
        allStatuses={ALL_STATUSES}
        assigned={assigned}
        q={q}
        agents={agents.map((a) => ({ id: a.id, name: a.name }))}
      />

      <ContactsTable rows={rows} agentCapacities={agentCapacities} />

      <ContactsPagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount ?? 0} />
    </div>
  );
}
