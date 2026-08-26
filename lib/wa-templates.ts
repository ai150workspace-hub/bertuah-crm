// lib/wa-templates.ts
//
// Fetch template WA dari tabel wa_templates (bukan hardcode) dan isi
// placeholder-nya. Dipakai tombol "Kirim WA" di customer-drawer.tsx dan
// halaman /agent/reengagement.

import { createClient } from "@/lib/supabase/server";
import { fillWaPlaceholders, type WaPlaceholderData } from "@/lib/script-placeholder";

export type WaTemplateKey =
  | "initial_followup"
  | "appointment_confirmation"
  | "followup_reminder"
  | "reengagement";

export interface WaTemplate {
  templateKey: WaTemplateKey;
  templateName: string;
  templateText: string;
  whenToUse: string | null;
}

export async function getWaTemplate(key: WaTemplateKey): Promise<WaTemplate | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_templates")
    .select("template_key, template_name, template_text, when_to_use")
    .eq("template_key", key)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  return {
    templateKey: data.template_key,
    templateName: data.template_name,
    templateText: data.template_text,
    whenToUse: data.when_to_use,
  };
}

export interface WaTemplateAdminRow extends WaTemplate {
  id: string;
  displayOrder: number;
  isActive: boolean;
}

/** Dipakai halaman admin/scripts - termasuk yang non-aktif. */
export async function getAllWaTemplates(): Promise<WaTemplateAdminRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_templates")
    .select("id, template_key, template_name, template_text, when_to_use, display_order, is_active")
    .order("display_order");
  return (data ?? []).map((row) => ({
    id: row.id,
    templateKey: row.template_key,
    templateName: row.template_name,
    templateText: row.template_text,
    whenToUse: row.when_to_use,
    displayOrder: row.display_order,
    isActive: row.is_active,
  }));
}

/** Ambil template lalu langsung isi placeholder-nya jadi pesan siap kirim. */
export async function buildWaMessage(
  key: WaTemplateKey,
  data: WaPlaceholderData
): Promise<string | null> {
  const template = await getWaTemplate(key);
  if (!template) return null;
  return fillWaPlaceholders(template.templateText, data);
}

/** wa.me link - phoneE164 dari lib/telephony/phone.ts normalisasiNomor(). */
export function buildWaLink(phoneE164: string | undefined, message: string): string | undefined {
  if (!phoneE164) return undefined;
  return `https://wa.me/${phoneE164}?text=${encodeURIComponent(message)}`;
}
