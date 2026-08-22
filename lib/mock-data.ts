// Placeholder data for agent-dashboard KPI cards not yet wired to
// Supabase (today's calls, contact rate, incentive estimate). The rest
// of the app (contacts, applications, admin dashboard) now reads live
// data - see lib/admin-metrics.ts and lib/contacts.ts.
export const AGENT_KPI = {
  todayCalls: 14,
  contactRate: 42.9,
  readyToSurvey: 2,
  monthlyDisbursement: 85_000_000,
  estimatedIncentive: 2_712_500,
};
