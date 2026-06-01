export const DISPUTE_STATUS_LABELS = [
  "Awaiting resolution",
  "Evidence submitted",
  "AI review ready",
  "Resolved onchain"
] as const;

export type DisputeStatusLabel = typeof DISPUTE_STATUS_LABELS[number];

export const DISPUTE_STATUS_COLORS: Record<DisputeStatusLabel, string> = {
  "Awaiting resolution": "bg-slate-500/10 text-slate-400 border-slate-500/20",
  "Evidence submitted": "bg-info/10 text-info border-info/20",
  "AI review ready": "bg-warning/10 text-warning border-warning/20",
  "Resolved onchain": "bg-success/10 text-success border-success/20"
};

export function getDisputeStatus(dispute: {
  resolved?: boolean;
  outcome?: number | string;
}, options?: {
  hasEvidence?: boolean;
  hasAIReview?: boolean;
}): DisputeStatusLabel {
  if (dispute.resolved === true) return "Resolved onchain";
  if (options?.hasAIReview) return "AI review ready";
  if (options?.hasEvidence) return "Evidence submitted";
  return "Awaiting resolution";
}
