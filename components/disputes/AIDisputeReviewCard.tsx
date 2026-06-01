import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Textarea } from "../ui/Textarea";

export type AIDisputeReviewView = {
  recommended_outcome: "agent_wins" | "client_wins" | "split" | "manual_review_required";
  confidence: number | string | null;
  agent_bps: number | string | null;
  client_bps: number | string | null;
  slash_amount: string | null;
  reasoning: string;
  evidence_summary: string | null;
  fairness_notes: string | null;
  risk_flags: string[] | null;
  review_uri?: string | null;
  review_round?: number | string | null;
  created_at?: string | null;
  rubric_scores?: {
    jobClarity?: number | string | null;
    deliverableRelevance?: number | string | null;
    completeness?: number | string | null;
    evidenceStrength?: number | string | null;
    rejectionSpecificity?: number | string | null;
    badFaithIndicators?: number | string | null;
  } | null;
};

const OUTCOME_COPY = {
  agent_wins: { label: "Agent Wins", className: "border-success/30 bg-success/10 text-success" },
  client_wins: { label: "Client Wins", className: "border-danger/30 bg-danger/10 text-danger" },
  split: { label: "Split Resolution", className: "border-info/30 bg-info/10 text-info" },
  manual_review_required: { label: "Manual Review Required", className: "border-warning/30 bg-warning/10 text-warning" }
} as const;

const RUBRIC_COPY = {
  jobClarity: "Job clarity",
  deliverableRelevance: "Deliverable relevance",
  completeness: "Completeness",
  evidenceStrength: "Evidence strength",
  rejectionSpecificity: "Rejection specificity",
  badFaithIndicators: "Bad-faith indicators"
} as const;

export function AIDisputeReviewCard(props: {
  review: AIDisputeReviewView | null;
  loading: boolean;
  error: string | null;
  onRun: (requestReReview: boolean) => void;
  reReviewUsed: boolean;
  newEvidenceAvailable: boolean;
  reReviewReason: string;
  onReReviewReasonChange: (value: string) => void;
}) {
  const outcome = props.review ? OUTCOME_COPY[props.review.recommended_outcome] : null;
  const confidence = props.review ? Math.round(Number(props.review.confidence || 0) * 100) : 0;
  const reviewRound = Number(props.review?.review_round || 1);
  const reReviewReady = props.newEvidenceAvailable || props.reReviewReason.trim().length >= 20;

  return (
    <Card className="border-borderDark/70 bg-black/20 p-7 shadow-depth-md">
      {!props.review ? (
        <div>
          <div className="text-label text-accent">AI Dispute Review Pending</div>
          <h2 className="mt-3 font-heading text-[24px] tracking-[-0.02em] text-white">Run an impartial escrow review</h2>
          <p className="mt-3 max-w-3xl text-[14px] leading-7 text-slate-400">
            The resolver agent compares the job request, submitted deliverable, rejection reason, and submitted evidence against a consistent rubric.
          </p>
          {props.error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-6 text-danger">{props.error}</div>}
          <Button className="mt-5" onClick={() => props.onRun(false)} disabled={props.loading}>
            {props.loading ? "Reviewing Dispute..." : "Run AI Dispute Review"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${outcome?.className}`}>{outcome?.label}</span>
            <span className="rounded-full border border-borderDark bg-white/[0.03] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">Confidence {confidence}%</span>
            <span className="rounded-full border border-borderDark bg-white/[0.03] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Review round {reviewRound}</span>
          </div>
          <div>
            <div className="text-label">AI Recommendation</div>
            <p className="mt-3 text-[14px] leading-7 text-slate-300">{props.review.reasoning}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="text-label">Evidence Summary</div>
              <p className="mt-3 text-[13px] leading-6 text-slate-400">{props.review.evidence_summary || "No additional evidence summary was provided."}</p>
            </div>
            <div>
              <div className="text-label">Fairness Notes</div>
              <p className="mt-3 text-[13px] leading-6 text-slate-400">{props.review.fairness_notes || "No additional fairness note was provided."}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-borderDark bg-black/30 p-4"><div className="text-label">Agent Share</div><div className="mono-value mt-2 text-[17px] text-white">{String(props.review.agent_bps || 0)} BPS</div></div>
            <div className="rounded-xl border border-borderDark bg-black/30 p-4"><div className="text-label">Client Share</div><div className="mono-value mt-2 text-[17px] text-white">{String(props.review.client_bps || 0)} BPS</div></div>
            <div className="rounded-xl border border-borderDark bg-black/30 p-4"><div className="text-label">Suggested Slash</div><div className="mono-value mt-2 text-[17px] text-white">{props.review.slash_amount || "0"} USDC</div></div>
          </div>
          {props.review.rubric_scores && (
            <div>
              <div className="text-label">Review Rubric</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(RUBRIC_COPY).map(([key, label]) => (
                  <div key={key} className="rounded-xl border border-borderDark bg-black/30 p-4">
                    <div className="text-[11px] leading-5 text-slate-500">{label}</div>
                    <div className="mono-value mt-2 text-[16px] text-white">{String(props.review?.rubric_scores?.[key as keyof typeof RUBRIC_COPY] ?? 0)}/100</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {props.review.risk_flags && props.review.risk_flags.length > 0 && (
            <div>
              <div className="text-label">Risk Flags</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {props.review.risk_flags.map((flag) => <span key={flag} className="rounded-full border border-warning/25 bg-warning/5 px-3 py-1 text-[11px] text-warning">{flag.replace(/_/g, " ")}</span>)}
              </div>
            </div>
          )}
          <details className="rounded-xl border border-borderDark/70 bg-black/25 p-4">
            <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Developer details</summary>
            <div className="mono-value mt-4 grid gap-2 text-[11px] leading-5 text-slate-500">
              <div>Reviewed at: {props.review.created_at || "Not recorded"}</div>
              <div>Review URI: {props.review.review_uri || "Not recorded"}</div>
            </div>
          </details>
          {props.error && <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-6 text-danger">{props.error}</div>}
          <div className="rounded-xl border border-borderDark/70 bg-black/25 p-5">
            <div className="text-label">One-Time Re-review</div>
            {props.reReviewUsed ? (
              <p className="mt-3 text-[13px] leading-6 text-slate-500">The one permitted re-review has already been used for this dispute.</p>
            ) : (
              <>
                <p className="mt-3 text-[13px] leading-6 text-slate-500">
                  A second and final AI pass is available only when new evidence has been added or a material appeal reason is provided.
                </p>
                <Textarea
                  className="mt-4 min-h-[86px]"
                  label="Material appeal reason (optional if new evidence was added)"
                  placeholder="Explain the material issue the second review should consider."
                  value={props.reReviewReason}
                  onChange={(event) => props.onReReviewReasonChange(event.target.value)}
                />
                <Button className="mt-4" variant="secondary" onClick={() => props.onRun(true)} disabled={props.loading || !reReviewReady}>
                  {props.loading ? "Reviewing..." : "Request One Re-review"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
