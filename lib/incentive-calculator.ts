// Agent compensation logic — ported from FinMatch_PKU_PRD_v1.0.md section 19.
// Boundary interpretation: `>` conditions are literal, so exactly Rp200jt/280jt/350jt/500jt
// fall into the lower tier. Flag OQ8 in the PRD before payroll goes live.

export const BASE_SALARY = 2_500_000;

export interface AgentMonthlyData {
  agentId: string;
  agentName: string;
  totalDisbursement: number;
  avg3MonthDisbursement: number;
}

export interface IncentiveResult {
  agentId: string;
  agentName: string;
  totalDisbursement: number;
  baseSalary: number;
  mainRate: number;
  mainIncentive: number;
  productivityBonus: number;
  consistencyBonus: number;
  totalCompensation: number;
  tierLabel: string;
}

export function getMainRate(disbursement: number): { rate: number; label: string } {
  if (disbursement > 500_000_000) return { rate: 0.025, label: ">Rp500jt (2.50%)" };
  if (disbursement > 350_000_000)
    return { rate: 0.0125, label: ">Rp350jt–Rp500jt (1.25%)" };
  if (disbursement > 280_000_000)
    return { rate: 0.0075, label: ">Rp280jt–Rp350jt (0.75%)" };
  if (disbursement > 200_000_000)
    return { rate: 0.005, label: ">Rp200jt–Rp280jt (0.50%)" };
  if (disbursement >= 100_000_000)
    return { rate: 0.0025, label: "Rp100jt–Rp200jt (0.25%)" };
  return { rate: 0, label: "<Rp100jt (belum dapat insentif)" };
}

export function getProductivityBonus(disbursement: number): number {
  if (disbursement > 500_000_000) return 3_000_000;
  if (disbursement >= 350_000_000) return 1_500_000;
  return 0;
}

export function getConsistencyBonus(avg3Months: number): number {
  if (avg3Months > 250_000_000) return 1_000_000;
  if (avg3Months >= 150_000_000) return 500_000;
  return 0;
}

export function calculateAgentIncentive(
  data: AgentMonthlyData,
  baseSalary = BASE_SALARY
): IncentiveResult {
  const { rate, label } = getMainRate(data.totalDisbursement);
  const mainIncentive = Math.round(data.totalDisbursement * rate);
  const productivityBonus = getProductivityBonus(data.totalDisbursement);
  const consistencyBonus = getConsistencyBonus(data.avg3MonthDisbursement);

  return {
    agentId: data.agentId,
    agentName: data.agentName,
    totalDisbursement: data.totalDisbursement,
    baseSalary,
    mainRate: rate,
    mainIncentive,
    productivityBonus,
    consistencyBonus,
    totalCompensation:
      baseSalary + mainIncentive + productivityBonus + consistencyBonus,
    tierLabel: label,
  };
}

export function calculateTeamIncentives(
  agents: AgentMonthlyData[]
): IncentiveResult[] {
  return agents.map((a) => calculateAgentIncentive(a));
}

/** Revenue agregator — only realized when application status is Disbursed. */
export function calculatePkuRevenue(
  disbursement: number,
  commissionPercent = 5
): number {
  return Math.round(disbursement * (commissionPercent / 100));
}
