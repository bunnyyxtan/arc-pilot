import { getJobStatusColor } from "../../lib/design/status";

export function JobStatusBadge({ statusLabel, className = "" }: { statusLabel: string; className?: string }) {
  const colorClasses = getJobStatusColor(statusLabel);

  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${colorClasses} ${className}`}>
      {statusLabel}
    </span>
  );
}
