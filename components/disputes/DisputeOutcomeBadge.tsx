import { DISPUTE_OUTCOME_COLORS, DISPUTE_OUTCOME_LABELS } from "../../lib/design/status";

export function DisputeOutcomeBadge({ outcome, className = "" }: { outcome: number; className?: string }) {
  // 0: Pending, 1: AgentWins, 2: ClientWins, 3: Split
  const index = Math.min(Math.max(0, outcome), 3);
  const label = DISPUTE_OUTCOME_LABELS[index] || "Unknown";
  const colorClasses = DISPUTE_OUTCOME_COLORS[index] || DISPUTE_OUTCOME_COLORS[0];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tracking-[0] ${colorClasses} ${className}`}>
      {label}
    </span>
  );
}
