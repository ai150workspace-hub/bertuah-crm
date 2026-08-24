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

export default async function AgentQueuePage() {
  const profile = await getCurrentUser();
  const supabase = await createClient();

  const { data: contactRows } = profile
    ? await supabase
        .from("contacts")
        .select(CONTACT_SELECT)
        .eq("assigned_to", profile.id)
        .order("created_at", { ascending: true })
    : { data: null };

  let contacts = ((contactRows ?? []) as ContactRow[]).map(mapDbContact);
  if (profile) contacts = await markPreviousCallFlags(contacts, profile.id);
  const capabilities = await getCapabilities();
  const activeSlots = profile ? await getActiveSlots(supabase, profile.id) : null;

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
      />
    </div>
  );
}
