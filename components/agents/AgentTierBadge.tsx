import { getTierForScore, getTierColor } from "../../lib/design/copy";
import { Badge } from "../ui/Badge";

export function AgentTierBadge({ score, className = "" }: { score: bigint | number; className?: string }) {
  const tier = getTierForScore(score);
  
  // Need to extract just the background/text classes, but Badge handles variants if we use it, 
  // or we can just pass className directly to a span to match copy.ts exactly
  const colorClasses = getTierColor(tier);

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] ${colorClasses} ${className}`}>
      {tier}
    </span>
  );
}
