"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ScriptSection } from "@/lib/scripts";
import type { WaTemplateKey } from "@/lib/wa-templates";

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Belum login." };

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return { ok: false, error: "Hanya admin yang boleh melakukan ini." };

  return { ok: true };
}

export interface ScriptsActionResult {
  success: boolean;
  error?: string;
}

export interface ScriptContentInput {
  section: ScriptSection;
  scenarioName: string;
  category?: string | null;
  scriptText: string;
  tipsText?: string | null;
  escalationRule?: string | null;
  isBuyingSignal?: boolean;
  displayOrder: number;
}

export async function createScriptContent(input: ScriptContentInput): Promise<ScriptsActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.from("script_content").insert({
    section: input.section,
    scenario_name: input.scenarioName,
    category: input.category || null,
    script_text: input.scriptText,
    tips_text: input.tipsText || null,
    escalation_rule: input.escalationRule || null,
    is_buying_signal: input.isBuyingSignal ?? false,
    display_order: input.displayOrder,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/scripts");
  return { success: true };
}

export async function updateScriptContent(
  id: string,
  input: ScriptContentInput
): Promise<ScriptsActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("script_content")
    .update({
      section: input.section,
      scenario_name: input.scenarioName,
      category: input.category || null,
      script_text: input.scriptText,
      tips_text: input.tipsText || null,
      escalation_rule: input.escalationRule || null,
      is_buying_signal: input.isBuyingSignal ?? false,
      display_order: input.displayOrder,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/scripts");
  return { success: true };
}

export async function toggleScriptContentActive(
  id: string,
  isActive: boolean
): Promise<ScriptsActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("script_content")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/scripts");
  return { success: true };
}

export interface WaTemplateInput {
  templateName: string;
  templateText: string;
  whenToUse?: string | null;
}

export async function updateWaTemplate(
  templateKey: WaTemplateKey,
  input: WaTemplateInput
): Promise<ScriptsActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("wa_templates")
    .update({
      template_name: input.templateName,
      template_text: input.templateText,
      when_to_use: input.whenToUse || null,
    })
    .eq("template_key", templateKey);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/scripts");
  return { success: true };
}

export async function toggleWaTemplateActive(
  templateKey: WaTemplateKey,
  isActive: boolean
): Promise<ScriptsActionResult> {
  const check = await requireAdmin();
  if (!check.ok) return { success: false, error: check.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("wa_templates")
    .update({ is_active: isActive })
    .eq("template_key", templateKey);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/scripts");
  return { success: true };
}
