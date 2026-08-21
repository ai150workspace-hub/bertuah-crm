// Call Status Tree — 4-level hierarchy, cross-checked against Call Status Tree.xlsx
// and FinMatch_PKU_PRD.md section 8.

export const CALL_STATUS_TREE = {
  CONNECTED: {
    label: "Connected",
    level2: {
      Contacted: {
        label: "Contacted",
        level3: {
          Present: {
            label: "Present",
            level4: ["Interest", "Prospect", "Unprospect"] as const,
            unprospectDetails: [
              "Angsuran Masih Banyak",
              "Dana Cari Rendah",
              "Dana Sudah Cair",
              "Inquiry",
              "Invalid Data",
              "Kendaraan Masih Kredit",
              "Konfirmasi Pasangan",
              "Masih Pikir-pikir",
              "No Coverage Area",
              "No Need Money",
              "Pricing",
              "Service",
              "Others",
            ] as const,
          },
          Unpresent: {
            label: "Unpresent",
            level4: ["Callback", "Meeting", "Reject Front", "Others"] as const,
          },
        },
      },
      Uncontacted: {
        label: "Uncontacted",
        level3Final: [
          "Busy Tone",
          "Mailbox",
          "No Body Pick Up",
          "No Tones",
          "Reminder",
        ] as const,
      },
    },
  },
  UNCONNECTED: {
    label: "Unconnected",
    level2: {
      "Invalid Number": {
        label: "Invalid Number",
        level3Final: ["No Salah", "Bad Rating", "Konsumen Meninggal"] as const,
      },
    },
  },
} as const;

export type Level1 = keyof typeof CALL_STATUS_TREE;

export function getLevel2Options(level1: Level1): string[] {
  return Object.keys(CALL_STATUS_TREE[level1].level2);
}

export function getLevel3Options(level1: Level1, level2: string): string[] {
  const l2 = (CALL_STATUS_TREE[level1].level2 as Record<string, unknown>)[
    level2
  ] as { level3?: Record<string, unknown>; level3Final?: readonly string[] };
  if (!l2) return [];
  if (l2.level3) return Object.keys(l2.level3);
  if (l2.level3Final) return [...l2.level3Final];
  return [];
}

export function getLevel4Options(
  level1: Level1,
  level2: string,
  level3: string
): string[] {
  const l2 = (CALL_STATUS_TREE[level1].level2 as Record<string, unknown>)[
    level2
  ] as { level3?: Record<string, { level4?: readonly string[] }> };
  const l3 = l2?.level3?.[level3];
  return l3?.level4 ? [...l3.level4] : [];
}

export function getUnprospectDetails(): string[] {
  return [
    ...CALL_STATUS_TREE.CONNECTED.level2.Contacted.level3.Present
      .unprospectDetails,
  ];
}

/** Derives the summary `status_call` a contact should move to after a call log is saved. */
export function deriveContactStatus(log: {
  level1: Level1 | string;
  level2?: string;
  level3?: string;
  level4?: string;
}): string {
  if (log.level1 === "UNCONNECTED") return "Invalid";
  if (log.level4 === "Interest" || log.level4 === "Prospect")
    return "Hot Lead";
  if (log.level3 === "Present") return "Contacted";
  if (log.level2 === "Contacted") return "In Progress";
  return "In Progress";
}
