// lib/scripts.ts — fetch script_content dari Supabase (bukan hardcode).
// Dipakai ScriptSidebar (agent) dan halaman admin/scripts (kelola).

import { createClient } from "@/lib/supabase/server";

export type ScriptSection =
  | "opening"
  | "probing"
  | "presentasi"
  | "closing"
  | "objection_handling";

export interface ScriptContentRow {
  id: string;
  section: ScriptSection;
  scenarioName: string;
  category: string | null;
  scriptText: string;
  tipsText: string | null;
  escalationRule: string | null;
  isBuyingSignal: boolean;
  displayOrder: number;
  isActive: boolean;
}

interface RawScriptContentRow {
  id: string;
  section: ScriptSection;
  scenario_name: string;
  category: string | null;
  script_text: string;
  tips_text: string | null;
  escalation_rule: string | null;
  is_buying_signal: boolean;
  display_order: number;
  is_active: boolean;
}

function mapScriptRow(row: RawScriptContentRow): ScriptContentRow {
  return {
    id: row.id,
    section: row.section,
    scenarioName: row.scenario_name,
    category: row.category,
    scriptText: row.script_text,
    tipsText: row.tips_text,
    escalationRule: row.escalation_rule,
    isBuyingSignal: row.is_buying_signal,
    displayOrder: row.display_order,
    isActive: row.is_active,
  };
}

/** Dipakai ScriptSidebar - hanya yang aktif, urut section lalu display_order. */
export async function getActiveScriptContent(): Promise<ScriptContentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("script_content")
    .select(
      "id, section, scenario_name, category, script_text, tips_text, escalation_rule, is_buying_signal, display_order, is_active"
    )
    .eq("is_active", true)
    .order("section")
    .order("display_order");
  return ((data ?? []) as RawScriptContentRow[]).map(mapScriptRow);
}

/** Dipakai halaman admin/scripts - termasuk yang non-aktif, biar bisa diaktifkan lagi. */
export async function getAllScriptContent(): Promise<ScriptContentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("script_content")
    .select(
      "id, section, scenario_name, category, script_text, tips_text, escalation_rule, is_buying_signal, display_order, is_active"
    )
    .order("section")
    .order("display_order");
  return ((data ?? []) as RawScriptContentRow[]).map(mapScriptRow);
}
