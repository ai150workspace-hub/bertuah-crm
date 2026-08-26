// lib/leasing-partners.ts — fetch daftar leasing partner.
//
// Tabel ini SUDAH ADA sejak 0001_base_schema.sql (bukan dibuat sesi ini) -
// name, pic_name, pic_phone, pic_email, coverage_area (text[]), notes,
// is_active, created_at. Tidak ada kolom urutan tampil manual, jadi
// diurutkan alfabetis.

import { createClient } from "@/lib/supabase/server";

export interface LeasingPartnerRow {
  id: string;
  name: string;
  isActive: boolean;
  picName: string | null;
  picPhone: string | null;
}

interface RawLeasingPartnerRow {
  id: string;
  name: string;
  is_active: boolean | null;
  pic_name: string | null;
  pic_phone: string | null;
}

function mapRow(row: RawLeasingPartnerRow): LeasingPartnerRow {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active ?? true,
    picName: row.pic_name,
    picPhone: row.pic_phone,
  };
}

/** Dipakai dropdown "Ajukan Aplikasi Baru" - hanya yang aktif. */
export async function getActiveLeasingPartners(): Promise<LeasingPartnerRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leasing_partners")
    .select("id, name, is_active, pic_name, pic_phone")
    .eq("is_active", true)
    .order("name");
  return ((data ?? []) as RawLeasingPartnerRow[]).map(mapRow);
}

/** Dipakai halaman admin/leasing - termasuk yang non-aktif. */
export async function getAllLeasingPartners(): Promise<LeasingPartnerRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leasing_partners")
    .select("id, name, is_active, pic_name, pic_phone")
    .order("name");
  return ((data ?? []) as RawLeasingPartnerRow[]).map(mapRow);
}
