// Service-role Supabase client — BYPASSES RLS entirely.
//
// Only for trusted server-side code that must reach tables mitra are
// intentionally denied access to (call_sessions, call_recordings,
// reconciliation_daily — see docs/TELEPHONY.md rule #2). Never import this
// from a Client Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
