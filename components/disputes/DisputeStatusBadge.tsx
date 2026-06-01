import { DISPUTE_STATUS_COLORS, type DisputeStatusLabel } from "../../lib/design/status";

export function DisputeStatusBadge({ status, className = "" }: { status: DisputeStatusLabel; className?: string }) {
  const colorClasses = DISPUTE_STATUS_COLORS[status] || DISPUTE_STATUS_COLORS.Open;

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tracking-[0] ${colorClasses} ${className}`}>
      {status}
    </span>
  );
}
