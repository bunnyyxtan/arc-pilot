export const JOB_STATUS_COLORS: Record<string, string> = {
  Open: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  Funded: "bg-info/10 text-info border-info/20",
  Running: "bg-accent/10 text-accent border-accent/20",
  Submitted: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Rejected: "bg-danger/10 text-danger border-danger/20",
  Disputed: "bg-danger/10 text-danger border-danger/20",
  Expired: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  Refunded: "bg-slate-500/10 text-slate-400 border-slate-500/20"
};

export function getJobStatusColor(statusLabel: string): string {
  return JOB_STATUS_COLORS[statusLabel] || JOB_STATUS_COLORS.Open;
}

export const DISPUTE_OUTCOME_COLORS = [
  "bg-slate-500/10 text-slate-400 border-slate-500/20", // Pending
  "bg-success/10 text-success border-success/20",     // Agent Wins
  "bg-success/10 text-success border-success/20",     // Client Wins
  "bg-info/10 text-info border-info/20",            // Split
];

export const DISPUTE_OUTCOME_LABELS = [
  "Pending",
  "Agent Wins",
  "Client Wins",
  "Split",
];

export { DISPUTE_STATUS_COLORS, DISPUTE_STATUS_LABELS, getDisputeStatus, type DisputeStatusLabel } from "../disputes/status";
