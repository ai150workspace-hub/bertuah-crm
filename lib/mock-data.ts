// Static placeholder data for the Phase 1 UI shell.
// Replace with Supabase queries once the database is wired up (Phase 2+).
import type { AppUser, Application, Contact, LeasingPartner } from "@/types";

export const CURRENT_AGENT: AppUser = {
  id: "agent-1",
  name: "Rina Marpaung",
  role: "agent",
  email: "rina@bertuahcrm.id",
  active: true,
};

export const CURRENT_ADMIN: AppUser = {
  id: "admin-1",
  name: "Budi Hutagalung",
  role: "admin",
  email: "budi@bertuahcrm.id",
  active: true,
};

export const AGENTS: AppUser[] = [
  CURRENT_AGENT,
  {
    id: "agent-2",
    name: "Doni Sitorus",
    role: "agent",
    email: "doni@bertuahcrm.id",
    active: true,
  },
];

export const MOCK_CONTACTS: Contact[] = [
  {
    id: "c1",
    nama: "Ahmad Fauzi",
    noHp: "0811-7654-321",
    jenisKendaraan: "Mobil",
    merkTipe: "Honda Jazz",
    tahun: 2019,
    domisili: "Tampan, Pekanbaru",
    statusPajak: "Hidup",
    statusCall: "Hot Lead",
    statusProspek: "Interest",
    lastContactedAt: "2026-08-20T09:12:00+07:00",
  },
  {
    id: "c2",
    nama: "Siti Rahma",
    noHp: "0812-3344-556",
    jenisKendaraan: "Motor",
    merkTipe: "Yamaha NMAX",
    tahun: 2021,
    domisili: "Marpoyan Damai, Pekanbaru",
    statusPajak: "Hidup",
    statusCall: "Contacted",
    lastContactedAt: "2026-08-20T10:40:00+07:00",
  },
  {
    id: "c3",
    nama: "Parlindungan Sitompul",
    noHp: "0821-9988-112",
    jenisKendaraan: "Mobil",
    merkTipe: "Toyota Avanza",
    tahun: 2020,
    domisili: "Sukajadi, Pekanbaru",
    statusPajak: "Hidup",
    statusCall: "In Progress",
    lastContactedAt: "2026-08-19T14:05:00+07:00",
  },
  {
    id: "c4",
    nama: "Melda Simanjuntak",
    noHp: "0853-1122-334",
    jenisKendaraan: "Motor",
    merkTipe: "Honda Beat",
    tahun: 2020,
    domisili: "Payung Sekaki, Pekanbaru",
    statusPajak: "Mati",
    statusCall: "Uncalled",
  },
  {
    id: "c5",
    nama: "Rudi Hartono",
    noHp: "0822-5566-778",
    jenisKendaraan: "Mobil",
    merkTipe: "Daihatsu Xenia",
    tahun: 2018,
    domisili: "Bukit Raya, Pekanbaru",
    statusPajak: "Hidup",
    statusCall: "Uncalled",
  },
  {
    id: "c6",
    nama: "Fitri Amelia",
    noHp: "0813-4455-667",
    jenisKendaraan: "Motor",
    merkTipe: "Yamaha Aerox",
    tahun: 2022,
    domisili: "Tenayan Raya, Pekanbaru",
    statusPajak: "Hidup",
    statusCall: "Uncalled",
  },
];

export const LEASING_PARTNERS: LeasingPartner[] = [
  { id: "l1", name: "Adira Finance", active: true, defaultCommissionPercent: 5 },
  { id: "l2", name: "BFI Finance", active: true, defaultCommissionPercent: 5 },
  { id: "l3", name: "Mega Finance", active: true, defaultCommissionPercent: 6 },
];

export const MOCK_APPLICATIONS: Application[] = [
  {
    id: "a1",
    contactId: "c1",
    contactName: "Ahmad Fauzi",
    agentId: "agent-1",
    leasingPartner: "Adira Finance",
    nominalPencairan: 85_000_000,
    komisiPercent: 5,
    statusAplikasi: "Disbursed",
    createdAt: "2026-08-05T08:00:00+07:00",
  },
  {
    id: "a2",
    contactId: "c3",
    contactName: "Parlindungan Sitompul",
    agentId: "agent-1",
    leasingPartner: "BFI Finance",
    nominalPencairan: 120_000_000,
    komisiPercent: 5,
    statusAplikasi: "Survey",
    createdAt: "2026-08-15T08:00:00+07:00",
  },
  {
    id: "a3",
    contactId: "c2",
    contactName: "Siti Rahma",
    agentId: "agent-2",
    leasingPartner: "Mega Finance",
    nominalPencairan: 18_000_000,
    komisiPercent: 6,
    statusAplikasi: "Sent to Leasing",
    createdAt: "2026-08-18T08:00:00+07:00",
  },
];

export const AGENT_KPI = {
  myLeads: MOCK_CONTACTS.length,
  todayCalls: 14,
  contactRate: 42.9,
  hotLeads: MOCK_CONTACTS.filter((c) => c.statusCall === "Hot Lead").length,
  readyToSurvey: 2,
  monthlyDisbursement: 85_000_000,
  estimatedIncentive: 2_712_500,
};

export const ADMIN_KPI = {
  totalCalls: 214,
  contactRate: 34.6,
  interest: 28,
  prospect: 15,
  hotLeads: 6,
  readyToSurvey: 4,
  totalApplications: MOCK_APPLICATIONS.length,
  survey: 1,
  approved: 0,
  disbursed: 1,
  totalRevenue: 4_250_000,
};

export const FUNNEL_STAGES = [
  { label: "Database", value: 100000 },
  { label: "Called", value: 620 },
  { label: "Connected", value: 214 },
  { label: "Interested", value: 28 },
  { label: "Prospect", value: 15 },
  { label: "Ready to Survey", value: 4 },
  { label: "Sent to Leasing", value: 3 },
  { label: "Survey", value: 1 },
  { label: "Approved", value: 1 },
  { label: "Disbursed", value: 1 },
];
