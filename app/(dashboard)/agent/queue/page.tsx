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

export default async function AgentQueuePage() {
  const profile = await getCurrentUser();
  const supabase = await createClient();

  const { data: contactRows } = profile
    ? await supabase
        .from("contacts")
        .select(CONTACT_SELECT)
        .eq("assigned_to", profile.id)
        // Closed/Invalid sudah selesai (tidak pernah dilepas otomatis, lihat
        // 0011/0018) dan terus menumpuk selamanya di agent yang sama - kalau
        // ikut di-fetch di sini, lama-lama menyesaki limit di bawah dan
        // mendesak keluar kerjaan yang masih aktif (Uncalled/In Progress/
        // Warm/Hot Lead). "Antrean Saya" scope-nya kerjaan aktif saja;
        // riwayat Closed/Invalid ada jalurnya sendiri (Log Aktivitas admin).
        .not("status_call", "in", "(Closed,Invalid)")
        // created_at saja tidak cukup sebagai urutan - banyak baris dari
        // batch upload/klaim yang sama punya created_at IDENTIK, dan tanpa
        // tie-breaker kedua, urutan mana yang "menang" masuk 500 pertama
        // tidak konsisten (ditemukan nyata: satu batch klaim 65 kontak yang
        // semuanya punya created_at sama malah semuanya terlempar ke luar
        // limit). id sebagai tie-breaker membuat urutannya deterministik.
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        // Safety cap - halaman ini sengaja fetch semua lead AKTIF milik
        // agent sekaligus (search/sort/filter di client butuh semuanya
        // ter-load), tapi dibatasi biar tidak pernah fetch tanpa batas kalau
        // kapasitas seorang agent suatu saat di-set sangat besar.
        .limit(1000)
    : { data: null };

  const rawContacts = ((contactRows ?? []) as ContactRow[]).map(mapDbContact);

  // 5 operasi independen (tidak saling butuh hasil satu sama lain) - jalan
  // bareng, bukan berurutan.
  const [contacts, capabilities, activeSlots, scripts, initialFollowupTemplate] = await Promise.all([
    profile ? markPreviousCallFlags(rawContacts, profile.id) : Promise.resolve(rawContacts),
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
        scripts={scripts}
        agentId={profile?.id}
        agentCreatedAt={profile?.createdAt}
        initialFollowupTemplate={initialFollowupTemplate?.templateText ?? null}
      />
    </div>
  );
}
