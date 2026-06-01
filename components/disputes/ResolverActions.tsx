import { getGuardedOutcome, type AIDisputeReviewView } from "./AIDisputeReviewCard";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function ResolverActions(props: {
  review: AIDisputeReviewView;
  disabled: boolean;
  onExecuteRecommendation: () => void;
  onResolveAgentWins: () => void;
  onResolveClientWins: () => void;
  onResolveSplit: () => void;
}) {
  const guardedOutcome = getGuardedOutcome(props.review);
  const modelOutcome = props.review.model_recommendation || props.review.recommended_outcome;
  const agentBps = Number(props.review.agent_bps || 0);
  const clientBps = Number(props.review.client_bps || 0);
  const slashAmount = props.review.slash_amount || "0";
  const label = (outcome: string) => outcome === "agent_wins" ? "Agent Wins" : outcome === "client_wins" ? "Client Wins" : outcome === "split" ? "Split" : "Needs Admin Review";

  return (
    <Card className="border-accent/20 bg-accent/[0.035] p-7 shadow-depth-md">
      <div className="text-label text-accent">Resolver Decision</div>
      <p className="mt-3 text-[13px] leading-6 text-slate-400">
        Execute the final onchain resolution. The recommended action sends an explicit onchain transaction.
      </p>

      {/* AI recommendation summary */}
      <div className="mt-5 rounded-xl border border-borderDark/70 bg-black/25 p-4">
        <div className="text-[12px] text-slate-500">AI Recommendation</div>
        <div className="mt-2 text-[14px] font-medium text-slate-300">{label(modelOutcome)}</div>
        <div className="mt-4 text-[12px] text-slate-500">Guarded Recommendation</div>
        <div className="mt-2 text-[14px] font-medium text-white">{label(guardedOutcome)}</div>
        <div className="mt-4 grid gap-2 text-[12px] leading-5 text-slate-400 sm:grid-cols-3">
          <div>Agent receives <span className="mono-value text-white">{agentBps / 100}%</span></div>
          <div>Client receives <span className="mono-value text-white">{clientBps / 100}%</span></div>
          <div>Slash amount <span className="mono-value text-white">{slashAmount} USDC</span></div>
        </div>
      </div>

      {/* Primary button */}
      <Button
        className="mt-5 w-full"
        onClick={props.onExecuteRecommendation}
        disabled={props.disabled || guardedOutcome === "manual_review_required" || guardedOutcome === "needs_admin_review"}
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
        <Button variant="secondary" onClick={props.onResolveSplit} disabled={props.disabled}>
          Resolve: Split
        </Button>
      </div>
    </Card>
  );
}
