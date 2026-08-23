export type NextApplicationStatus =
  | "Sent to Leasing"
  | "Survey"
  | "Approved"
  | "Disbursed"
  | "Rejected";

export const NEXT_ALLOWED_STATUS: Record<string, NextApplicationStatus[]> = {
  Draft: ["Sent to Leasing", "Rejected"],
  "Sent to Leasing": ["Survey", "Rejected"],
  Survey: ["Approved", "Rejected"],
  Approved: ["Disbursed", "Rejected"],
};
