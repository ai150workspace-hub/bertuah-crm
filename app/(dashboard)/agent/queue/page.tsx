import { QueueTable } from "@/components/agent/QueueTable";
import { createClient } from "@/lib/supabase/server";
import {
  CONTACT_SELECT,
  mapDbContact,
  getActiveSlots,
  markPreviousCallFlags,
  type ContactRow,
} from "@/lib/contacts";
import { getCapabilities } from "@/lib/telephony/provider";

export default async function AgentQueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("users").select("agent_status").eq("id", user.id).maybeSingle()
    : { data: null };

  const { data: contactRows } = user
    ? await supabase
        .from("contacts")
        .select(CONTACT_SELECT)
        .eq("assigned_to", user.id)
        .order("created_at", { ascending: true })
    : { data: null };

  let contacts = ((contactRows ?? []) as ContactRow[]).map(mapDbContact);
  if (user) contacts = await markPreviousCallFlags(contacts, user.id);
  const capabilities = await getCapabilities();
  const activeSlots = user ? await getActiveSlots(supabase, user.id) : null;

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
        agentStatus={profile?.agent_status as "active" | "pause" | "inactive" | undefined}
      />
    </div>
  );
}
