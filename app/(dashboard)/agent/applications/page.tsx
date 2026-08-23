import { FileStack, Clock, CircleCheck, Banknote } from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CreateApplicationDialog, type EligibleContact } from "@/components/agent/create-application-dialog";
import { ApplicationsTable, type AgentApplicationRow } from "@/components/agent/applications-table";
import { createClient } from "@/lib/supabase/server";
import { formatCompactRupiah } from "@/lib/format";
import type { ApplicationStatus } from "@/types";

const ACTIVE_STATUSES = ["Draft", "Sent to Leasing", "Survey", "Approved"];

interface ApplicationDbRow {
  id: string;
  contact_id: string;
  leasing_partner: string;
  nominal_pengajuan: number;
  nominal_pencairan: number | null;
  status_aplikasi: string;
  created_at: string;
  rejection_reason: string | null;
  contacts: { nama: string } | { nama: string }[] | null;
}

function contactName(c: ApplicationDbRow["contacts"]): string {
  if (!c) return "—";
  return Array.isArray(c) ? (c[0]?.nama ?? "—") : c.nama;
}

export default async function AgentApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: appRows }, { data: hotLeadRows }] = await Promise.all([
    user
      ? supabase
          .from("applications")
          .select(
            "id, contact_id, leasing_partner, nominal_pengajuan, nominal_pencairan, status_aplikasi, created_at, rejection_reason, contacts(nama)"
          )
          .eq("agent_id", user.id)
          .order("created_at", { ascending: false })
      : { data: null },
    user
      ? supabase
          .from("contacts")
          .select("id, nama, no_hp")
          .eq("assigned_to", user.id)
          .eq("status_call", "Hot Lead")
          .order("nama")
      : { data: null },
  ]);

  const apps = (appRows ?? []) as unknown as ApplicationDbRow[];

  const rows: AgentApplicationRow[] = apps.map((a) => ({
    id: a.id,
    contactName: contactName(a.contacts),
    leasingPartner: a.leasing_partner,
    nominalPengajuan: a.nominal_pengajuan,
    nominalPencairan: a.nominal_pencairan,
    statusAplikasi: a.status_aplikasi as ApplicationStatus,
    createdAt: a.created_at,
    rejectionReason: a.rejection_reason,
  }));

  // Kontak dengan aplikasi apa pun selain Rejected tidak boleh diajukan lagi
  // lewat picker ini (termasuk yang sudah Disbursed - tidak perlu diulang).
  const blockedContactIds = new Set(
    apps.filter((a) => a.status_aplikasi !== "Rejected").map((a) => a.contact_id)
  );
  const eligibleContacts: EligibleContact[] = (hotLeadRows ?? [])
    .filter((c) => !blockedContactIds.has(c.id))
    .map((c) => ({ id: c.id, nama: c.nama, noHp: c.no_hp }));

  const totalAplikasi = rows.length;
  const dalamProses = rows.filter((r) => ACTIVE_STATUSES.includes(r.statusAplikasi)).length;
  const disbursedRows = rows.filter((r) => r.statusAplikasi === "Disbursed");
  const totalPencairan = disbursedRows.reduce((sum, r) => sum + (r.nominalPencairan ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Aplikasi Saya</h1>
          <p className="text-sm text-muted-foreground">
            Pengajuan pembiayaan dari kontak Hot Lead kamu, sampai cair.
          </p>
        </div>
        <CreateApplicationDialog contacts={eligibleContacts} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Aplikasi" value={String(totalAplikasi)} icon={FileStack} />
        <KpiCard label="Dalam Proses" value={String(dalamProses)} icon={Clock} />
        <KpiCard label="Disbursed" value={String(disbursedRows.length)} icon={CircleCheck} tone="success" />
        <KpiCard
          label="Total Pencairan"
          value={formatCompactRupiah(totalPencairan)}
          icon={Banknote}
          tone="success"
        />
      </div>

      <ApplicationsTable rows={rows} />
    </div>
  );
}
