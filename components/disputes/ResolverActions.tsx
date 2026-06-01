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
      <div className="text-label text-accent">Resolver Controls</div>
      <h2 className="mt-3 font-heading text-[22px] tracking-[-0.02em] text-white">Execute reviewed outcome</h2>
      <p className="mt-3 text-[13px] leading-6 text-slate-400">
        This section is visible only to the ArcPilot resolver/admin wallet. The recommended action remains an explicit onchain transaction.
      </p>
      <Button
        className="mt-5"
        onClick={props.onExecuteRecommendation}
        disabled={props.disabled || props.review.recommended_outcome === "manual_review_required"}
      >
        Execute AI Recommendation
      </Button>
      <details className="mt-6 rounded-xl border border-borderDark/70 bg-black/25 p-4">
        <summary className="cursor-pointer text-[12px] font-medium uppercase tracking-[0.16em] text-slate-400">Advanced Resolver Controls</summary>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <Button variant="success" onClick={props.onResolveAgentWins} disabled={props.disabled}>Resolve Agent Wins</Button>
          <div>
            <Input label="Slash amount (USDC)" type="number" step="0.000001" min="0" value={props.slashAmount} onChange={(event) => props.onSlashAmountChange(event.target.value)} />
            <Button className="mt-3 w-full" variant="danger" onClick={props.onResolveClientWins} disabled={props.disabled}>Resolve Client Wins</Button>
          </div>
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Agent BPS" type="number" value={props.agentBps} onChange={(event) => props.onAgentBpsChange(event.target.value)} />
              <Input label="Client BPS" type="number" value={props.clientBps} onChange={(event) => props.onClientBpsChange(event.target.value)} />
            </div>
            <Button className="mt-3 w-full" variant="secondary" onClick={props.onResolveSplit} disabled={props.disabled || !validSplit}>Resolve Split</Button>
          </div>
        </div>
      </details>
    </Card>
  );
}
