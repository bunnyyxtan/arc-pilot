import { formatUSDC } from "../../lib/format/usdc";
import type { AgentStatsView } from "../../lib/sdk/types";
import { MetricCard } from "../ui/MetricCard";

export function AgentStatsGrid({ stats }: { stats: AgentStatsView }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Completed Jobs"
        value={Number(stats.completedJobs).toString()}
        subtext={`${Number(stats.failedJobs)} Failed / ${Number(stats.disputedJobs)} Disputed / Third-party only`}
      />
      <MetricCard
        title="Lifetime Earned"
        value={formatUSDC(stats.lifetimeEarned, { compact: true })}
        subtext="Third-party completed work"
      />
      <MetricCard
        title="Total Escrowed"
        value={formatUSDC(stats.totalEscrowed, { compact: true })}
        subtext="Third-party client value"
      />
      <MetricCard
        title="Total Slashed"
        value={formatUSDC(stats.totalSlashed, { compact: true })}
        subtext="Penalties applied"
      />
    </div>
  );
}
