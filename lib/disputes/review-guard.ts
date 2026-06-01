export type GuardedReviewOutcome = "agent_wins" | "client_wins" | "split" | "needs_admin_review";
export type ReviewStrength = "weak" | "medium" | "strong";
export type ReviewRisk = "low" | "medium" | "high";
export type ScopeAssessment = "in_scope" | "out_of_scope" | "unclear";

export type ReviewRubricScores = {
  jobMatch: number;
  completeness: number;
  deliverableQuality: number;
  clientReasonSpecificity: number;
  evidenceStrength: number;
  scopeAlignment: number;
  badFaithRisk: number;
};

export type ReviewGuardInput = {
  modelRecommendation: GuardedReviewOutcome;
  confidence: number;
  agentBps: number;
  clientBps: number;
  slashAmount: string;
  rubricScores: ReviewRubricScores;
  rejectionReason: string;
  evidenceCount: number;
  deliverablePresent: boolean;
  scopeAssessment: ScopeAssessment;
  clientContinuedOutOfScope?: boolean;
  riskFlags?: string[];
};

export type ReviewGuardResult = {
  guardedRecommendation: GuardedReviewOutcome;
  confidence: number;
  agentBps: number;
  clientBps: number;
  slashAmount: string;
  clientClaimStrength: ReviewStrength;
  agentDeliverableStrength: ReviewStrength;
  badFaithRisk: ReviewRisk;
  riskFlags: string[];
  guardReason: string | null;
};

const VAGUE_REJECTION = /^(?:bad|wrong|low quality|not good|i do not like it|i don't like it|did not like it|poor|unsatisfactory)[.! ]*$/i;

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function strength(score: number): ReviewStrength {
  if (score >= 70) return "strong";
  if (score >= 40) return "medium";
  return "weak";
}

function risk(score: number): ReviewRisk {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function isVagueRejectionReason(reason: string) {
  const clean = reason.trim();
  return clean.length < 20 || VAGUE_REJECTION.test(clean);
}

export function evidenceWasSubmitted(evidenceCount: number) {
  return Number.isFinite(evidenceCount) && evidenceCount > 0;
}

export function applyReviewGuard(input: ReviewGuardInput): ReviewGuardResult {
  const scores = Object.fromEntries(
    Object.entries(input.rubricScores).map(([key, value]) => [key, clampScore(value)])
  ) as ReviewRubricScores;
  const vagueRejection = isVagueRejectionReason(input.rejectionReason);
  const effectiveEvidence = evidenceWasSubmitted(input.evidenceCount) ? scores.evidenceStrength : 0;
  const clientClaimScore = Math.round((scores.clientReasonSpecificity + effectiveEvidence) / 2);
  const agentStrengthScore = Math.round((scores.jobMatch + scores.completeness + scores.deliverableQuality) / 3);
  const elevatedBadFaith = vagueRejection && !evidenceWasSubmitted(input.evidenceCount) && agentStrengthScore >= 65
    ? Math.max(scores.badFaithRisk, 65)
    : scores.badFaithRisk;
  const riskFlags = [...(input.riskFlags ?? [])];
  if (vagueRejection) riskFlags.push("Vague rejection reason");
  if (!evidenceWasSubmitted(input.evidenceCount)) riskFlags.push("No supporting evidence");
  if (scores.jobMatch >= 70 && scores.deliverableQuality >= 70) riskFlags.push("Deliverable appears relevant");
  if (input.scopeAssessment === "out_of_scope") riskFlags.push("Task may be outside agent scope");

  let guardedRecommendation = input.modelRecommendation;
  let guardReason: string | null = null;
  if (!input.deliverablePresent && guardedRecommendation === "agent_wins") {
    guardedRecommendation = "needs_admin_review";
    guardReason = "Agent wins cannot be executed because the saved deliverable is missing.";
  } else if (
    guardedRecommendation === "client_wins"
    && !evidenceWasSubmitted(input.evidenceCount)
    && scores.clientReasonSpecificity < 30
    && scores.jobMatch > 70
    && scores.deliverableQuality > 70
  ) {
    guardedRecommendation = input.confidence >= 0.75 ? "agent_wins" : "needs_admin_review";
    guardReason = "Client wins was blocked because the deliverable appears relevant and the rejection lacks specific supporting evidence.";
  } else if (guardedRecommendation === "client_wins" && input.scopeAssessment === "out_of_scope" && input.clientContinuedOutOfScope) {
    guardedRecommendation = "needs_admin_review";
    guardReason = "Client wins was blocked because the client knowingly continued with an out-of-scope request.";
  } else if (
    guardedRecommendation === "client_wins"
    && scores.jobMatch >= 70
    && scores.deliverableQuality >= 70
    && clientClaimScore < 40
  ) {
    guardedRecommendation = "needs_admin_review";
    guardReason = "Client wins was blocked because the rubric contradicts the recommendation.";
  } else if (
    guardedRecommendation === "agent_wins"
    && (scores.jobMatch < 30 || scores.deliverableQuality < 30)
  ) {
    guardedRecommendation = "needs_admin_review";
    guardReason = "Agent wins was blocked because the rubric indicates materially weak or unrelated work.";
  }

  let agentBps = input.agentBps;
  let clientBps = input.clientBps;
  if (guardedRecommendation === "agent_wins") [agentBps, clientBps] = [10000, 0];
  if (guardedRecommendation === "client_wins") [agentBps, clientBps] = [0, 10000];
  if (guardedRecommendation === "needs_admin_review") [agentBps, clientBps] = [0, 0];
  if (guardedRecommendation === "split" && (agentBps < 0 || clientBps < 0 || agentBps + clientBps !== 10000)) {
    [agentBps, clientBps] = [5000, 5000];
  }

  return {
    guardedRecommendation,
    confidence: Math.min(1, Math.max(0, input.confidence || 0)),
    agentBps,
    clientBps,
    slashAmount: guardedRecommendation === "client_wins" ? input.slashAmount : "0",
    clientClaimStrength: strength(clientClaimScore),
    agentDeliverableStrength: strength(agentStrengthScore),
    badFaithRisk: risk(elevatedBadFaith),
    riskFlags: unique(riskFlags),
    guardReason
  };
}
