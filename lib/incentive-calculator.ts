// Agent incentive + PKU margin calculator — pure functions, no Supabase import.
// Business logic as specified by ops (2026-08-23): base salary + per-deal
// daily commission (rate keyed by tenor) + flat monthly bonus tier.

export const AGENT_BASE_SALARY = 1_500_000;
export const PKU_COMMISSION_RATE = 0.05; // 5% dari nominal pencairan
export const OPEX_NON_SALARY = 1_960_000; // opex selain gaji, dibagi rata per agent aktif

// ---------------------------------------------------------------------
// Komisi harian — rate per deal berdasarkan tenor_bulan.
// Tenor di luar kunci berikut memakai rate tenor terdekat DI BAWAHNYA
// (tenor 18 -> rate 12, tenor 30 -> rate 24, tenor 42 -> rate 36).
// ---------------------------------------------------------------------
const DAILY_RATES: Record<number, number> = {
  12: 0.0025,
  24: 0.005,
  36: 0.01,
  48: 0.0125,
};

const DAILY_RATE_TENOR_KEYS = [12, 24, 36, 48];

export function getDailyRate(tenorBulan: number): number {
  const match = [...DAILY_RATE_TENOR_KEYS].reverse().find((k) => tenorBulan >= k);
  return DAILY_RATES[match ?? 12]!;
}

// ---------------------------------------------------------------------
// Komisi bulanan — flat bonus berdasarkan TOTAL nominal_pencairan agen
// dalam bulan tersebut. Tier pertama yang cocok (min <= total < max).
// ---------------------------------------------------------------------
export interface MonthlyBonusTier {
  min: number;
  max: number;
  bonus: number;
  /** Label badge, mis. "≥ Rp350jt". */
  label: string;
}

export const MONTHLY_BONUS_TIERS: MonthlyBonusTier[] = [
  { min: 0, max: 100_000_000, bonus: 0, label: "< Rp100jt" },
  { min: 100_000_000, max: 150_000_000, bonus: 500_000, label: "≥ Rp100jt" },
  { min: 150_000_000, max: 200_000_000, bonus: 950_000, label: "≥ Rp150jt" },
  { min: 200_000_000, max: 250_000_000, bonus: 1_500_000, label: "≥ Rp200jt" },
  { min: 250_000_000, max: 300_000_000, bonus: 2_100_000, label: "≥ Rp250jt" },
  { min: 300_000_000, max: 350_000_000, bonus: 2_800_000, label: "≥ Rp300jt" },
  { min: 350_000_000, max: 400_000_000, bonus: 3_600_000, label: "≥ Rp350jt" },
  { min: 400_000_000, max: 450_000_000, bonus: 4_500_000, label: "≥ Rp400jt" },
  { min: 450_000_000, max: 500_000_000, bonus: 5_500_000, label: "≥ Rp450jt" },
  { min: 500_000_000, max: 550_000_000, bonus: 6_600_000, label: "≥ Rp500jt" },
  { min: 550_000_000, max: Infinity, bonus: 7_800_000, label: "≥ Rp550jt" },
];

export function getMonthlyBonusTier(totalPencairan: number): MonthlyBonusTier {
  return (
    MONTHLY_BONUS_TIERS.find((t) => totalPencairan >= t.min && totalPencairan < t.max) ??
    MONTHLY_BONUS_TIERS[MONTHLY_BONUS_TIERS.length - 1]!
  );
}

// ---------------------------------------------------------------------
// Kalkulasi per agent
// ---------------------------------------------------------------------
export interface DisbursedDeal {
  nominalPencairan: number;
  tenorBulan: number;
}

export interface AgentIncentiveInput {
  agentId: string;
  agentName: string;
  deals: DisbursedDeal[];
}

export interface AgentIncentiveResult {
  agentId: string;
  agentName: string;
  totalPencairan: number;
  totalDailyKomisi: number;
  monthlyBonus: number;
  takeHome: number;
  revenuePku: number;
  netPku: number;
  /** null berarti revenuePku = 0 -> tampilkan "—" di UI. */
  marginPkuPct: number | null;
  tierLabel: string;
}

export function calculateAgentIncentive(
  input: AgentIncentiveInput,
  activeAgentCount: number
): AgentIncentiveResult {
  const totalPencairan = input.deals.reduce((s, d) => s + d.nominalPencairan, 0);
  const totalDailyKomisi = input.deals.reduce(
    (s, d) => s + d.nominalPencairan * getDailyRate(d.tenorBulan),
    0
  );
  const tier = getMonthlyBonusTier(totalPencairan);
  const monthlyBonus = tier.bonus;
  const takeHome = AGENT_BASE_SALARY + totalDailyKomisi + monthlyBonus;

  const revenuePku = totalPencairan * PKU_COMMISSION_RATE;
  const opexPerAgent =
    AGENT_BASE_SALARY +
    totalDailyKomisi +
    monthlyBonus +
    OPEX_NON_SALARY / Math.max(1, activeAgentCount);
  const netPku = revenuePku - opexPerAgent;
  const marginPkuPct = revenuePku === 0 ? null : (netPku / revenuePku) * 100;

  return {
    agentId: input.agentId,
    agentName: input.agentName,
    totalPencairan,
    totalDailyKomisi: Math.round(totalDailyKomisi),
    monthlyBonus,
    takeHome: Math.round(takeHome),
    revenuePku: Math.round(revenuePku),
    netPku: Math.round(netPku),
    marginPkuPct,
    tierLabel: tier.label,
  };
}
