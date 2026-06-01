import { NextResponse } from "next/server";
import { isResolverAdminWallet } from "../../../../../lib/auth/resolver";
import { getVerifiedWalletFromRequest } from "../../../../../lib/auth/wallet-session";
import { decodeJobURI } from "../../../../../lib/contracts/job-uri";
import { normalizeWallet } from "../../../../../lib/deliverables/access";
import { toBigIntSafe } from "../../../../../lib/format/ids";
import { logger } from "../../../../../lib/logger";
import { hashFromDeliverableURI, readDeliverable } from "../../../../../lib/openai/deliverable";
import { runAIDisputeReview } from "../../../../../lib/openai/dispute-resolver";
import { getAgent } from "../../../../../lib/sdk/agents";
import { getDispute } from "../../../../../lib/sdk/disputes";
import { getJobView } from "../../../../../lib/sdk/jobs";
import { toSupabaseJson } from "../../../../../lib/supabase/indexed-data";
import { createServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";

const CHAIN_ID = 5042002;

function safeId(value: bigint) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value.toString();
}

function safeSupabaseMessage(error: { code?: string; message?: string } | null) {
  if (!error) return "Unknown Supabase error.";
  if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
    return "AI dispute review storage is not configured. Apply lib/supabase/schema.sql in Supabase.";
  }
  return error.message || "Supabase could not save the AI dispute review.";
}

function reviewRound(review: Record<string, unknown> | null) {
  return Number(review?.review_round || 1);
}

function validAppealText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 3000) : "";
}

async function loadReviews(disputeId: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("ai_dispute_reviews")
    .select("*")
    .eq("dispute_id", disputeId)
    .order("review_round", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(safeSupabaseMessage(error));
  return (data ?? []) as Record<string, unknown>[];
}

async function loadEvidence(disputeId: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("dispute_evidence")
    .select("*")
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(safeSupabaseMessage(error));
  return (data ?? []) as Record<string, unknown>[];
}

function reviewResponse(reviews: Record<string, unknown>[], evidence: Record<string, unknown>[]) {
  const latest = reviews.at(-1) ?? null;
  const firstCreatedAt = reviews[0]?.created_at ? Date.parse(String(reviews[0].created_at)) : 0;
  const newEvidenceAvailable = evidence.some((item) => item.created_at && Date.parse(String(item.created_at)) > firstCreatedAt);
  return {
    review: latest,
    reviewRound: latest ? reviewRound(latest) : 0,
    reReviewUsed: reviews.some((item) => reviewRound(item) >= 2),
    evidenceCount: evidence.length,
    newEvidenceAvailable
  };
}

export async function GET(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  try {
    const { disputeId } = await context.params;
    const id = toBigIntSafe(disputeId);
    if (!id) return NextResponse.json({ ok: false, error: "disputeId must be a positive numeric identifier." }, { status: 400 });
    const [reviews, evidence] = await Promise.all([loadReviews(id.toString()), loadEvidence(id.toString())]);
    if (reviews.length === 0 && process.env.AUTO_RUN_AI_DISPUTE_REVIEW === "true") {
      logger.info("api.disputes.aiReview", "read:autoRun", { disputeId: id }, "No saved AI dispute review found; starting configured automatic review");
      return POST(new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
        body: JSON.stringify({ requestReReview: false })
      }), { params: Promise.resolve({ disputeId }) });
    }
    return NextResponse.json({ ok: true, ...reviewResponse(reviews, evidence) });
  } catch (error) {
    logger.warn("api.disputes.aiReview", "read:failed", { error }, "AI dispute review read failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load AI dispute review." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await context.params;
  const id = toBigIntSafe(disputeId);
  if (!id) return NextResponse.json({ ok: false, error: "disputeId must be a positive numeric identifier." }, { status: 400 });
  logger.info("api.disputes.aiReview", "create:received", { disputeId: id }, "AI dispute review request received");
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const requestReReview = body.requestType === "final_rereview" || body.requestReReview === true || body.forceRegenerate === true;
    const manualAppeal = validAppealText(body.manualAppeal || body.additionalEvidence);
    const supabase = createServiceRoleSupabaseClient();
    const [reviews, evidence] = await Promise.all([loadReviews(id.toString()), loadEvidence(id.toString())]);
    const existing = reviews.at(-1) ?? null;

    if (!requestReReview && existing) {
      return NextResponse.json({ ok: true, reused: true, ...reviewResponse(reviews, evidence), message: "Existing AI dispute review reused." });
    }
    if (requestReReview && !existing) {
      return NextResponse.json({ ok: false, error: "Run the initial AI dispute review before requesting a re-review." }, { status: 409 });
    }
    if (requestReReview && reviews.some((item) => reviewRound(item) >= 2)) {
      return NextResponse.json({ ok: false, error: "Re-review already used for this dispute." }, { status: 409 });
    }

    const dispute = await getDispute(id);
    const job = await getJobView(dispute.jobId);
    const agent = await getAgent(job.agentId);
    const decodedJob = decodeJobURI(job.jobURI);
    const verifiedWallet = normalizeWallet(getVerifiedWalletFromRequest(request));
    if (requestReReview) {
      const isResolver = Boolean(verifiedWallet && isResolverAdminWallet(verifiedWallet));
      const participants = [dispute.openedBy, job.client, job.evaluator, agent.owner].map((wallet) => normalizeWallet(String(wallet)));
      if (!verifiedWallet || (!participants.includes(verifiedWallet) && !isResolver)) {
        return NextResponse.json({ ok: false, error: "Verify a dispute participant wallet session before requesting a re-review." }, { status: 403 });
      }
      const originalCreatedAt = existing?.created_at ? Date.parse(String(existing.created_at)) : 0;
      const newEvidence = evidence.filter((item) => item.created_at && Date.parse(String(item.created_at)) > originalCreatedAt);
      if (newEvidence.length === 0 && manualAppeal.length < 20 && !isResolver) {
        return NextResponse.json({ ok: false, error: "Provide additional evidence or an appeal reason before requesting the one permitted re-review." }, { status: 400 });
      }
    }

    const { data: disputeMetadata } = await supabase
      .from("dispute_metadata")
      .select("*")
      .eq("reason_uri", dispute.reasonURI)
      .maybeSingle();
    const { data: agentMetadata } = agent.metadataURI
      ? await supabase.from("agent_metadata").select("*").eq("metadata_uri", agent.metadataURI).maybeSingle()
      : { data: null };
    const deliverableURI = disputeMetadata?.deliverable_uri || job.deliverableURI || "";
    const deliverableHash = hashFromDeliverableURI(deliverableURI);
    const deliverable = deliverableHash ? await readDeliverable(deliverableHash) : null;
    const round = requestReReview ? 2 : 1;

    const aiContext = toSupabaseJson({
      reviewRound: round,
      previousReview: requestReReview ? existing : null,
      appealReason: requestReReview ? manualAppeal || null : null,
      dispute: {
        disputeId: dispute.disputeId,
        jobId: dispute.jobId,
        openedBy: dispute.openedBy,
        reasonURI: dispute.reasonURI,
        evidenceURI: dispute.evidenceURI,
        createdAt: dispute.createdAt
      },
      originalJobRequest: decodedJob ?? { jobURI: job.jobURI },
      job: {
        amount: job.amount,
        clientBond: job.clientBond,
        client: job.client,
        evaluator: job.evaluator,
        status: job.statusLabel
      },
      agent: {
        agentId: agent.agentId,
        name: agent.name,
        category: agent.category,
        metadataURI: agent.metadataURI
      },
      agentMetadata: agentMetadata?.metadata ?? null,
      rejection: {
        category: disputeMetadata?.category ?? null,
        reason: disputeMetadata?.reason ?? dispute.reasonURI
      },
      evidence: evidence.map((item) => ({
        submittedByWallet: item.submitted_by_wallet,
        evidenceText: item.evidence_text,
        supportingLink: item.supporting_link,
        evidenceURI: item.evidence_uri,
        createdAt: item.created_at
      })),
      deliverable: deliverable ? {
        uri: deliverableURI,
        title: deliverable.generatedTitle,
        content: deliverable.generatedContent,
        qualityChecklist: deliverable.qualityChecklist
      } : {
        uri: deliverableURI,
        content: "Saved deliverable content was unavailable."
      }
    }) as Record<string, unknown>;
    const { model, review } = await runAIDisputeReview(aiContext);
    const reviewURI = `arcpilot://ai-dispute-review/dispute-${id.toString()}-round-${round}-${Date.now()}`;
    if (requestReReview) {
      const { error: deactivateError } = await supabase.from("ai_dispute_reviews").update({ is_active: false }).eq("dispute_id", id.toString());
      if (deactivateError) throw new Error(safeSupabaseMessage(deactivateError));
    }
    const insertRow = {
      chain_id: CHAIN_ID,
      dispute_id: safeId(dispute.disputeId),
      job_id: safeId(dispute.jobId),
      agent_id: safeId(job.agentId),
      reviewer_model: model,
      recommended_outcome: review.recommendedOutcome,
      confidence: review.confidence,
      agent_bps: review.agentBps,
      client_bps: review.clientBps,
      slash_amount: review.slashAmount,
      reasoning: review.reasoning,
      evidence_summary: review.evidenceSummary,
      fairness_notes: review.fairnessNotes,
      risk_flags: review.riskFlags,
      rubric_scores: review.rubricScores,
      review_round: round,
      parent_review_id: requestReReview ? existing?.id ?? null : null,
      is_active: true,
      reviewed_payload: toSupabaseJson({
        disputeId: id,
        jobId: dispute.jobId,
        agentId: job.agentId,
        reasonURI: dispute.reasonURI,
        evidenceURI: dispute.evidenceURI,
        evidenceCount: evidence.length,
        appealReason: manualAppeal || null,
        previousReviewId: existing?.id ?? null,
        deliverableURI,
        deliverableHash,
        jobTitle: decodedJob?.title ?? null,
        rejectionCategory: disputeMetadata?.category ?? null,
        rubricScores: review.rubricScores
      }),
      review_uri: reviewURI
    };
    const { data: saved, error } = await supabase.from("ai_dispute_reviews").insert(insertRow).select("*").single();
    if (error || !saved) throw new Error(safeSupabaseMessage(error));
    logger.info("api.disputes.aiReview", "create:success", {
      disputeId: id,
      reviewRound: round,
      recommendedOutcome: saved.recommended_outcome,
      confidence: saved.confidence
    }, "AI dispute review saved");
    return NextResponse.json({ ok: true, reused: false, ...reviewResponse([...reviews, saved], evidence) });
  } catch (error) {
    logger.error("api.disputes.aiReview", "create:failed", { disputeId: id, error }, "AI dispute review request failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AI dispute review failed." }, { status: 500 });
  }
}
