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
  split: { label: "Split", className: "border-info/30 bg-info/10 text-info" },
  manual_review_required: { label: "Needs Admin Review", className: "border-warning/30 bg-warning/10 text-warning" }
} as const;

function confidenceLabel(value: number): { text: string; className: string } {
  if (value >= 0.8) return { text: "High", className: "text-success" };
  if (value >= 0.55) return { text: "Medium", className: "text-warning" };
  return { text: "Low", className: "text-danger" };
}

export function AIDisputeReviewCard(props: {
  review: AIDisputeReviewView | null;
  loading: boolean;
  error: string | null;
  onRun: (requestReReview: boolean) => void;
  reReviewUsed: boolean;
  newEvidenceAvailable: boolean;
  reReviewReason: string;
  onReReviewReasonChange: (value: string) => void;
  isResolver?: boolean;
  isParticipant?: boolean;
  isPublic?: boolean;
}) {
  const outcome = props.review ? OUTCOME_COPY[props.review.recommended_outcome] : null;
  const confidence = props.review ? Math.round(Number(props.review.confidence || 0) * 100) / 100 : 0;
  const confidenceInfo = confidenceLabel(confidence);
  const hasEvidence = props.review?.evidence_summary && props.review.evidence_summary !== "No additional evidence summary was provided.";
  const reReviewReady = props.newEvidenceAvailable || props.reReviewReason.trim().length >= 20;

  /* No review yet */
  if (!props.review) {
    return (
      <Card className="border-borderDark/70 bg-black/20 p-7 shadow-depth-md">
        <div className="text-label text-accent">ArcPilot AI Review</div>
        <p className="mt-3 text-[14px] leading-7 text-slate-400">
          AI review has not been requested yet.
        </p>
        {props.error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-6 text-danger">{props.error}</div>}
        {props.isResolver ? (
          <Button className="mt-5" onClick={() => props.onRun(false)} disabled={props.loading}>
            {props.loading ? "Running AI Review..." : "Run AI Review"}
          </Button>
        ) : props.isParticipant ? (
          <Button className="mt-5" onClick={() => props.onRun(false)} disabled={props.loading}>
            {props.loading ? "Requesting AI Review..." : "Request AI Review"}
          </Button>
        ) : (
          <p className="mt-3 text-[13px] leading-6 text-slate-500">AI review pending.</p>
        )}
      </Card>
    );
  }

  /* Review exists */
  return (
    <Card className="border-borderDark/70 bg-black/20 p-7 shadow-depth-md">
      <div className="grid gap-6">
        {/* Outcome + confidence */}
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${outcome?.className}`}>
            {outcome?.label}
          </span>
          <span className={`text-[13px] font-medium ${confidenceInfo.className}`}>
            Confidence: {confidenceInfo.text}
          </span>
        </div>

        {/* Why */}
        <div>
          <div className="text-label">Why</div>
          <p className="mt-3 text-[14px] leading-7 text-slate-300">{props.review.reasoning}</p>
        </div>

        {/* Evidence considered */}
        <div className="flex items-center gap-3 text-[13px] text-slate-400">
          <span className="text-label">Evidence considered:</span>
          <span className={hasEvidence ? "text-success" : "text-slate-500"}>{hasEvidence ? "Yes" : "No"}</span>
        </div>

        {/* Risk flags */}
        {props.review.risk_flags && props.review.risk_flags.length > 0 && (
          <div>
            <div className="text-label">Risk Flags</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {props.review.risk_flags.map((flag) => (
                <span key={flag} className="rounded-full border border-warning/25 bg-warning/5 px-3 py-1 text-[11px] text-warning">
                  {flag.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Developer details — no model name */}
        <details className="rounded-xl border border-borderDark/70 bg-black/25 p-4">
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
            Developer details
          </summary>
          <div className="mono-value mt-4 grid gap-2 text-[11px] leading-5 text-slate-500">
            <div>Reviewed at: {props.review.created_at || "Not recorded"}</div>
            <div>Review round: {props.review.review_round || 1}</div>
            <div>Review URI: {props.review.review_uri || "Not recorded"}</div>
          </div>
        </details>

        {props.error && <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-6 text-danger">{props.error}</div>}

        {/* One-time re-review */}
        <div className="rounded-xl border border-borderDark/70 bg-black/25 p-5">
          <div className="text-label">Final Re-review</div>
          {props.reReviewUsed ? (
            <p className="mt-3 text-[13px] leading-6 text-slate-500">Final re-review already used.</p>
          ) : (
            <>
              <p className="mt-3 text-[13px] leading-6 text-slate-500">
                One final AI pass is available only when new evidence has been submitted or a material appeal reason is provided.
              </p>
              <Textarea
                className="mt-4 min-h-[86px]"
                label="Appeal reason (optional if new evidence was added)"
                placeholder="Explain what the final review should consider."
                value={props.reReviewReason}
                onChange={(event) => props.onReReviewReasonChange(event.target.value)}
              />
              <Button className="mt-4" variant="secondary" onClick={() => props.onRun(true)} disabled={props.loading || !reReviewReady}>
                {props.loading ? "Reviewing..." : "Request Final Re-review"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
