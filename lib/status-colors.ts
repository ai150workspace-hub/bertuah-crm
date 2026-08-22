import type { ApplicationStatus, StatusCall } from "@/types";

export const STATUS_CALL_COLORS: Record<StatusCall, string> = {
  Uncalled: "bg-muted text-muted-foreground",
  "In Progress": "bg-warning/15 text-warning-foreground border-warning/30",
  Contacted: "bg-primary/10 text-primary border-primary/20",
  "Hot Lead": "bg-hot/15 text-hot border-hot/30 font-semibold",
  Warm: "bg-warning/15 text-warning-foreground border-warning/30",
  Closed: "bg-muted text-muted-foreground",
  Submitted: "bg-accent text-accent-foreground",
  Rejected: "bg-destructive/10 text-destructive border-destructive/20",
  Invalid: "bg-muted text-muted-foreground line-through",
  Duplicate: "bg-muted text-muted-foreground",
};

export const STATUS_APLIKASI_COLORS: Record<ApplicationStatus, string> = {
  Draft: "bg-muted text-muted-foreground",
  "Ready to Survey": "bg-warning/15 text-warning-foreground border-warning/30",
  "Sent to Leasing": "bg-primary/10 text-primary border-primary/20",
  Survey: "bg-hot/15 text-hot border-hot/30",
  Approved: "bg-success/15 text-success border-success/30",
  Disbursed: "bg-success/20 text-success border-success/40 font-semibold",
  Rejected: "bg-destructive/10 text-destructive border-destructive/20",
};
