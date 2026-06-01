import type { AgentReviewSummary } from "../../lib/reputation/reviews";

export function AgentRatingSummary({ summary, className = "" }: { summary?: AgentReviewSummary | null; className?: string }) {
  const average = summary?.averageRating || 0;
  const count = summary?.reviewCount || 0;
  return (
    <div className={`flex items-center gap-1.5 whitespace-nowrap text-[12px] ${className}`}>
      {count > 0 && <span className="text-warning">&#9733;</span>}
      <span className={count > 0 ? "mono-value text-slate-300" : "text-slate-500"}>
        {count > 0 ? `${average.toFixed(1)}/5 · ${count} ${count === 1 ? "review" : "reviews"}` : "No reviews yet"}
      </span>
    </div>
  );
}
