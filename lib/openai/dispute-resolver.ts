import OpenAI from "openai";
import { applyReviewGuard, evidenceWasSubmitted, type GuardedReviewOutcome, type ReviewRubricScores, type ReviewStrength, type ScopeAssessment } from "../disputes/review-guard";
import { logger } from "../logger";
import { getOpenAIModelConfig } from "./model-config";

export type DisputeResolutionOutcome = GuardedReviewOutcome;

export type AIDisputeReview = {
  modelRecommendation: DisputeResolutionOutcome;
  guardedRecommendation: DisputeResolutionOutcome;
  recommendedOutcome: DisputeResolutionOutcome;
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  agentBps: number;
  clientBps: number;
  slashAmount: string;
  reasoning: string;
  evidenceConsidered: boolean;
  evidenceSummary: string;
  clientClaimStrength: ReviewStrength;
  agentDeliverableStrength: ReviewStrength;
  scopeAssessment: ScopeAssessment;
  badFaithRisk: "low" | "medium" | "high";
  fairnessNotes: string;
  riskFlags: string[];
  rubricScores: ReviewRubricScores;
  guardReason: string | null;
};

type RawReview = Record<string, unknown>;

export type DisputeReviewGuardContext = {
  evidenceCount: number;
  rejectionReason: string;
  deliverablePresent: boolean;
  scopeAssessment: ScopeAssessment;
  clientContinuedOutOfScope?: boolean;
};

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractFirstJsonObject(value: string): RawReview | null {
  const stripped = stripJsonFence(value);
  try {
    return JSON.parse(stripped) as RawReview;
  } catch {
    const start = stripped.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < stripped.length; index += 1) {
      const character = stripped[index];
      if (escaped) { escaped = false; continue; }
      if (character === "\\") { escaped = true; continue; }
      if (character === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(stripped.slice(start, index + 1)) as RawReview;
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanOutcome(value: unknown): DisputeResolutionOutcome {
  if (value === "manual_review_required") return "needs_admin_review";
  return value === "agent_wins" || value === "client_wins" || value === "split" || value === "needs_admin_review"
    ? value
    : "needs_admin_review";
}

function clampScore(value: unknown) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function confidenceLabel(value: number): "low" | "medium" | "high" {
  if (value >= 0.8) return "high";
  if (value >= 0.55) return "medium";
  return "low";
}

function normalizeRubricScores(value: unknown): ReviewRubricScores {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    jobMatch: clampScore(raw.job_match ?? raw.jobMatch),
    completeness: clampScore(raw.completeness),
    deliverableQuality: clampScore(raw.deliverable_quality ?? raw.deliverableQuality),
    clientReasonSpecificity: clampScore(raw.client_reason_specificity ?? raw.clientReasonSpecificity),
    evidenceStrength: clampScore(raw.evidence_strength ?? raw.evidenceStrength),
    scopeAlignment: clampScore(raw.scope_alignment ?? raw.scopeAlignment),
    badFaithRisk: clampScore(raw.bad_faith_risk ?? raw.badFaithRisk)
  };
}

function humanizeRiskFlag(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const known: Record<string, string> = {
    insufficient_evidence: "No supporting evidence",
    no_supporting_evidence: "No supporting evidence",
    vague_rejection_reason: "Vague rejection reason",
    unclear_original_request: "Unclear original request",
    incomplete_deliverable: "Incomplete deliverable",
    off_topic_deliverable: "Off-topic deliverable",
    possible_bad_faith_rejection: "Possible bad-faith rejection",
    deliverable_appears_relevant: "Deliverable appears relevant",
    task_may_be_outside_agent_scope: "Task may be outside agent scope"
  };
  return known[normalized] || value.trim().replace(/_/g, " ");
}

function normalizeModelReview(raw: RawReview) {
  const modelRecommendation = cleanOutcome(raw.recommendedOutcome);
  const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
  const rubricScores = normalizeRubricScores(raw.rubricScores);
  let agentBps = Number.isInteger(Number(raw.agentBps)) ? Number(raw.agentBps) : modelRecommendation === "agent_wins" ? 10000 : 0;
  let clientBps = Number.isInteger(Number(raw.clientBps)) ? Number(raw.clientBps) : modelRecommendation === "client_wins" ? 10000 : 0;
  if (modelRecommendation === "agent_wins") [agentBps, clientBps] = [10000, 0];
  if (modelRecommendation === "client_wins") [agentBps, clientBps] = [0, 10000];
  if (modelRecommendation === "needs_admin_review") [agentBps, clientBps] = [0, 0];
  if (modelRecommendation === "split" && (agentBps < 0 || clientBps < 0 || agentBps + clientBps !== 10000)) [agentBps, clientBps] = [5000, 5000];
  const slashAmount = typeof raw.slashAmount === "string" && /^\d+(?:\.\d{1,6})?$/.test(raw.slashAmount.trim()) ? raw.slashAmount.trim() : "0";
  const riskFlags = Array.isArray(raw.riskFlags)
    ? raw.riskFlags.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(humanizeRiskFlag).slice(0, 12)
    : [];
  return {
    modelRecommendation,
    confidence,
    agentBps,
    clientBps,
    slashAmount,
    reasoning: cleanText(raw.reasoning, "The available context requires resolver review."),
    evidenceSummary: cleanText(raw.evidenceSummary, "No additional evidence was provided."),
    fairnessNotes: cleanText(raw.fairnessNotes, "The recommendation is based on the objective rubric and saved ArcPilot context."),
    riskFlags,
    rubricScores
  };
}

function systemPrompt() {
  return [
    "You are the impartial ArcPilot AI Dispute Resolver Agent for paid USDC escrow jobs on Arc Testnet.",
    "Evaluate the original request, agent category and skills, scope check, saved deliverable, client rejection reason, and submitted evidence.",
    "Do not blindly accept the client's rejection. Judge the work against objective requirements.",
    "A vague, emotional, or unsupported rejection requires stronger evidence before client_wins is appropriate.",
    "If the deliverable clearly matches the request and the rejection is vague, prefer agent_wins.",
    "If the deliverable is incomplete, unrelated, empty, or materially low effort compared with the request, prefer client_wins.",
    "If both parties share fault, use split and ensure agentBps + clientBps = 10000.",
    "If the task was out of scope but the client knowingly continued anyway, do not automatically punish the agent.",
    "If confidence is low or the available signals contradict each other, use needs_admin_review.",
    "For identical inputs, return the same rubric and recommendation.",
    "Return JSON only. No markdown. No code fences. No extra text.",
    'Use this exact shape: {"recommendedOutcome":"agent_wins|client_wins|split|needs_admin_review","confidence":0.82,"agentBps":10000,"clientBps":0,"slashAmount":"0","reasoning":"plain English","evidenceSummary":"plain English","fairnessNotes":"plain English","riskFlags":["human readable flag"],"rubricScores":{"job_match":80,"completeness":70,"deliverable_quality":75,"client_reason_specificity":40,"evidence_strength":25,"scope_alignment":90,"bad_faith_risk":45}}.'
  ].join("\n");
}

export async function runAIDisputeReview(context: Record<string, unknown>, guardContext: DisputeReviewGuardContext) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing. Add it to .env.local or .env.");
  const model = getOpenAIModelConfig().disputeModel;
  logger.info("openai.disputeResolver", "review:start", { model, evidenceCount: guardContext.evidenceCount }, "AI dispute review starting");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: `Review this ArcPilot escrow dispute context and return the required JSON judgment:\n${JSON.stringify(context)}` }
    ]
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty dispute review response.");
  const parsed = extractFirstJsonObject(content);
  if (!parsed) throw new Error("OpenAI dispute review response could not be parsed as JSON.");
  const modelReview = normalizeModelReview(parsed);
  const guarded = applyReviewGuard({
    modelRecommendation: modelReview.confidence < 0.55 ? "needs_admin_review" : modelReview.modelRecommendation,
    confidence: modelReview.confidence,
    agentBps: modelReview.agentBps,
    clientBps: modelReview.clientBps,
    slashAmount: modelReview.slashAmount,
    rubricScores: modelReview.rubricScores,
    rejectionReason: guardContext.rejectionReason,
    evidenceCount: guardContext.evidenceCount,
    deliverablePresent: guardContext.deliverablePresent,
    scopeAssessment: guardContext.scopeAssessment,
    clientContinuedOutOfScope: guardContext.clientContinuedOutOfScope,
    riskFlags: modelReview.riskFlags
  });
  const review: AIDisputeReview = {
    modelRecommendation: modelReview.modelRecommendation,
    guardedRecommendation: guarded.guardedRecommendation,
    recommendedOutcome: guarded.guardedRecommendation,
    confidence: guarded.confidence,
    confidenceLabel: confidenceLabel(guarded.confidence),
    agentBps: guarded.agentBps,
    clientBps: guarded.clientBps,
    slashAmount: guarded.slashAmount,
    reasoning: guarded.guardReason ? `${modelReview.reasoning} ArcPilot guard: ${guarded.guardReason}` : modelReview.reasoning,
    evidenceConsidered: evidenceWasSubmitted(guardContext.evidenceCount),
    evidenceSummary: evidenceWasSubmitted(guardContext.evidenceCount) ? modelReview.evidenceSummary : "No additional evidence was provided.",
    clientClaimStrength: guarded.clientClaimStrength,
    agentDeliverableStrength: guarded.agentDeliverableStrength,
    scopeAssessment: guardContext.scopeAssessment,
    badFaithRisk: guarded.badFaithRisk,
    fairnessNotes: modelReview.fairnessNotes,
    riskFlags: guarded.riskFlags,
    rubricScores: modelReview.rubricScores,
    guardReason: guarded.guardReason
  };
  logger.info("openai.disputeResolver", "review:success", {
    model,
    modelRecommendation: review.modelRecommendation,
    guardedRecommendation: review.guardedRecommendation,
    confidence: review.confidence,
    evidenceConsidered: review.evidenceConsidered
  }, "AI dispute review completed");
  return { model, review };
}
