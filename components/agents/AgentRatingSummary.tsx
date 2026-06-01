import type { AgentReviewSummary } from "../../lib/reputation/reviews";

export function AgentRatingSummary({ summary, className = "" }: { summary?: AgentReviewSummary | null; className?: string }) {
  const average = summary?.averageRating || 0;
  const count = summary?.reviewCount || 0;
  return (
    <div className={`flex items-center gap-2 text-[13px] ${className}`}>
      <span className={count > 0 ? "text-warning" : "text-slate-600"}>{"★".repeat(count > 0 ? Math.max(1, Math.round(average)) : 1)}</span>
      <span className="mono-value text-slate-300">{count > 0 ? average.toFixed(1) : "New"}</span>
      <span className="text-slate-500">{count === 1 ? "1 review" : `${count} reviews`}</span>
    </div>
  );
}
