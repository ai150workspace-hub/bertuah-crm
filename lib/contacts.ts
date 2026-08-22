import type { Contact, StatusCall, VehicleType } from "@/types";

/** Raw shape selected from public.contacts. */
export interface ContactRow {
  id: string;
  nama: string;
  no_hp: string;
  jenis_kendaraan: string;
  merk_tipe: string | null;
  tahun: number | null;
  domisili: string | null;
  status_pajak: string | null;
  status_call: string;
  status_prospek: string | null;
  assigned_to: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
}

export function mapDbContact(row: ContactRow): Contact {
  return {
    id: row.id,
    nama: row.nama,
    noHp: row.no_hp,
    jenisKendaraan: row.jenis_kendaraan as VehicleType,
    merkTipe: row.merk_tipe ?? "",
    tahun: row.tahun ?? 0,
    domisili: row.domisili ?? "",
    statusPajak: (row.status_pajak ?? "Tidak Tahu") as Contact["statusPajak"],
    statusCall: row.status_call as StatusCall,
    statusProspek: row.status_prospek ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    lastContactedAt: row.last_contacted_at ?? undefined,
    nextFollowUpAt: row.next_follow_up_at ?? undefined,
  };
}

export const CONTACT_SELECT =
  "id, nama, no_hp, jenis_kendaraan, merk_tipe, tahun, domisili, status_pajak, status_call, status_prospek, assigned_to, last_contacted_at, next_follow_up_at";
