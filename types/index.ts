export type UserRole = "admin" | "agent";

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  active: boolean;
}

export type VehicleType = "Mobil" | "Motor";

export type StatusCall =
  | "Uncalled"
  | "In Progress"
  | "Contacted"
  | "Hot Lead"
  | "Warm"
  | "Closed"
  | "Submitted"
  | "Rejected"
  | "Invalid"
  | "Duplicate";

export interface Contact {
  id: string;
  nama: string;
  noHp: string;
  jenisKendaraan: VehicleType;
  merkTipe: string;
  tahun: number;
  domisili: string;
  statusPajak: "Hidup" | "Mati" | "Tidak Tahu";
  statusCall: StatusCall;
  statusProspek?: string;
  assignedTo?: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
}

export type ApplicationStatus =
  | "Draft"
  | "Ready to Survey"
  | "Sent to Leasing"
  | "Survey"
  | "Approved"
  | "Disbursed"
  | "Rejected";

export interface Application {
  id: string;
  contactId: string;
  contactName: string;
  agentId: string;
  leasingPartner: string;
  nominalPencairan: number;
  komisiPercent: number;
  statusAplikasi: ApplicationStatus;
  createdAt: string;
}

export interface LeasingPartner {
  id: string;
  name: string;
  active: boolean;
  defaultCommissionPercent: number;
}
