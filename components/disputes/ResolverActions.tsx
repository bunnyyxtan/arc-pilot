import type { AIDisputeReviewView } from "./AIDisputeReviewCard";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";

export function ResolverActions(props: {
  review: AIDisputeReviewView;
  disabled: boolean;
  slashAmount: string;
  agentBps: string;
  clientBps: string;
  onSlashAmountChange: (value: string) => void;
  onAgentBpsChange: (value: string) => void;
  onClientBpsChange: (value: string) => void;
  onExecuteRecommendation: () => void;
  onResolveAgentWins: () => void;
  onResolveClientWins: () => void;
  onResolveSplit: () => void;
}) {
  const validSplit = Number(props.agentBps) + Number(props.clientBps) === 10_000;

  return (
    <Card className="border-accent/20 bg-accent/[0.035] p-7 shadow-depth-md">
      <div className="text-label text-accent">Resolver Decision</div>
      <p className="mt-3 text-[13px] leading-6 text-slate-400">
        Execute the final onchain resolution. The recommended action sends an explicit onchain transaction.
      </p>

      {/* AI recommendation summary */}
      <div className="mt-5 rounded-xl border border-borderDark/70 bg-black/25 p-4">
        <div className="text-[12px] text-slate-500">AI Recommendation</div>
        <div className="mt-2 text-[14px] font-medium text-white">
          {props.review.recommended_outcome === "agent_wins" && "Agent Wins"}
          {props.review.recommended_outcome === "client_wins" && "Client Wins"}
          {props.review.recommended_outcome === "split" && "Split"}
          {props.review.recommended_outcome === "manual_review_required" && "Needs Admin Review"}
        </div>
      </div>

      {/* Primary button */}
      <Button
        className="mt-5 w-full"
        onClick={props.onExecuteRecommendation}
        disabled={props.disabled || props.review.recommended_outcome === "manual_review_required"}
      >
        Execute Recommended Outcome
      </Button>

      {/* Manual alternatives */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Button variant="success" onClick={props.onResolveAgentWins} disabled={props.disabled}>
          Resolve: Agent Wins
        </Button>
        <Button variant="danger" onClick={props.onResolveClientWins} disabled={props.disabled}>
          Resolve: Client Wins
        </Button>
        <Button variant="secondary" onClick={props.onResolveSplit} disabled={props.disabled || !validSplit}>
          Resolve: Split
        </Button>
      </div>

      {/* Advanced controls collapsed */}
      <details className="mt-6 rounded-xl border border-borderDark/70 bg-black/25 p-4">
        <summary className="cursor-pointer text-[12px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Advanced Settings
        </summary>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <Input
            label="Slash amount (USDC)"
            type="number"
            step="0.000001"
            min="0"
            value={props.slashAmount}
            onChange={(event) => props.onSlashAmountChange(event.target.value)}
          />
          <Input
            label="Agent BPS"
            type="number"
            value={props.agentBps}
            onChange={(event) => props.onAgentBpsChange(event.target.value)}
          />
          <Input
            label="Client BPS"
            type="number"
            value={props.clientBps}
            onChange={(event) => props.onClientBpsChange(event.target.value)}
          />
        </div>
      </details>
    </Card>
  );
}
