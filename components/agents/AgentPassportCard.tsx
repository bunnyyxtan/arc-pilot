import Link from "next/link";
import { formatAgentDisplayId } from "../../lib/design/agent-id";
import { formatUSDC } from "../../lib/format/usdc";
import type { AgentView } from "../../lib/sdk/types";
import { AgentIdentityBadge } from "./AgentIdentityBadge";
import { AgentRatingSummary } from "./AgentRatingSummary";
import { Card } from "../ui/Card";

export function AgentPassportCard({ agent }: { agent: AgentView }) {
  const displayId = formatAgentDisplayId(agent.name, agent.agentId);

  return (
    <Link href={`/agents/${agent.agentId}`}>
      <Card variant="glow" className="h-full flex flex-col hover:border-accent/30 transition-all duration-300 overflow-hidden group">
        <div className="p-5 flex gap-4">
          <div className="transition-transform duration-500 group-hover:scale-105">
            <AgentIdentityBadge name={agent.name || "ArcPilot Agent"} category={agent.category} />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <h3 className="truncate font-heading text-[17px] font-medium leading-tight tracking-[0] text-white">{agent.name || "Unnamed Agent"}</h3>
              <AgentRatingSummary summary={agent.reviewSummary} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${agent.active ? "bg-success animate-pulse" : "bg-slate-500"}`} />
              <div className="truncate text-[13px] leading-5 text-slate-400">{agent.category || "General Purpose"}</div>
            </div>
            <div className="mono-value mt-2 text-[11px] text-slate-500">{displayId}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-borderDark mt-auto">
          <div className="bg-panel p-3">
            <div className="text-label mb-1">Trust Bond</div>
            <div className="mono-value text-sm font-medium text-white">{formatUSDC(agent.trustBond, { compact: true })}</div>
          </div>
          <div className="bg-panel p-3">
            <div className="text-label mb-1">Jobs</div>
            <div className="mono-value text-sm font-medium text-white">{Number(agent.stats.completedJobs)} Client Done</div>
          </div>
          <div className="bg-panel p-3">
            <div className="text-label mb-1">Earned</div>
            <div className="mono-value text-sm font-medium text-success">{formatUSDC(agent.stats.lifetimeEarned, { compact: true })}</div>
          </div>
          <div className="bg-panel p-3">
            <div className="text-label mb-1">Onchain ID</div>
            <div className="mono-value text-xs font-medium text-slate-300">{agent.agentId.toString()}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
