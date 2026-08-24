import {
  Users,
  PhoneCall,
  TrendingUp,
  Flame,
  CalendarCheck,
  Wallet,
  Banknote,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QueueTable } from "@/components/agent/QueueTable";
import { AGENT_KPI } from "@/lib/mock-data";
import { formatCompactRupiah, formatPercent } from "@/lib/format";
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

const DASHBOARD_PREVIEW_SIZE = 5;

export default async function AgentDashboardPage() {
  const profile = await getCurrentUser();
  const supabase = await createClient();
  const firstName = profile?.name ? profile.name.split(" ")[0] : "";

  // Dashboard cuma butuh cuplikan kecil + 2 angka (total & hot leads), BUKAN
  // seluruh antrean - itu tugas /agent/queue. Sebelumnya halaman ini fetch
  // ulang SELURUH kontak agent + markPreviousCallFlags untuk semuanya cuma
  // untuk ditampilkan sebagai preview, sama persis dengan /agent/queue -
  // jadi 2x kerja berat untuk data yang sama. Di skala kapasitas besar
  // (ratusan lead/agent) ini yang paling berat, jadi dipangkas jadi query
  // ringan (count) + limit kecil untuk previewnya saja.
  const [{ count: totalLeads }, { count: hotLeadsCount }, { data: previewRows }] = profile
    ? await Promise.all([
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("assigned_to", profile.id),
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("assigned_to", profile.id)
          .eq("status_call", "Hot Lead"),
        supabase
          .from("contacts")
          .select(CONTACT_SELECT)
          .eq("assigned_to", profile.id)
          .order("created_at", { ascending: true })
          .limit(DASHBOARD_PREVIEW_SIZE),
      ])
    : [{ count: 0 }, { count: 0 }, { data: null }];

  const previewContacts = ((previewRows ?? []) as ContactRow[]).map(mapDbContact);
  const hotLeads = hotLeadsCount ?? 0;

  // 3 operasi independen (tidak saling butuh hasil satu sama lain) - jalan
  // bareng, bukan berurutan.
  const [contacts, capabilities, activeSlots] = await Promise.all([
    profile ? markPreviousCallFlags(previewContacts, profile.id) : Promise.resolve(previewContacts),
    getCapabilities(),
    profile ? getActiveSlots(supabase, profile.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Selamat bekerja{firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Ringkasan aktivitas kamu hari ini di Bertuah CRM.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="My Leads" value={String(totalLeads ?? 0)} icon={Users} />
        <KpiCard
          label="Today Calls"
          value={String(AGENT_KPI.todayCalls)}
          icon={PhoneCall}
        />
        <KpiCard
          label="Contact Rate"
          value={formatPercent(AGENT_KPI.contactRate)}
          icon={TrendingUp}
        />
        <KpiCard label="Hot Leads" value={String(hotLeads)} icon={Flame} tone="hot" />
        <KpiCard
          label="Ready to Survey"
          value={String(AGENT_KPI.readyToSurvey)}
          icon={CalendarCheck}
        />
        <KpiCard
          label="Pencairan Bulan Ini"
          value={formatCompactRupiah(AGENT_KPI.monthlyDisbursement)}
          icon={Banknote}
          tone="success"
        />
        <KpiCard
          label="Estimasi Insentif"
          value={formatCompactRupiah(AGENT_KPI.estimatedIncentive)}
          icon={Wallet}
          tone="success"
        />
      </div>

      <QueueTable
        contacts={contacts}
        capabilities={capabilities}
        activeSlots={activeSlots}
        agentStatus={profile?.agentStatus ?? undefined}
        totalCount={totalLeads ?? 0}
        compact
      />
    </div>
  );
}
