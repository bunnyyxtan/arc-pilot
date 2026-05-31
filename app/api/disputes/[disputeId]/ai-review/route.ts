import { NextResponse } from "next/server";
import { decodeJobURI } from "../../../../../lib/contracts/runtime";
import { logger } from "../../../../../lib/logger";
import { hashFromDeliverableURI, readDeliverable } from "../../../../../lib/openai/deliverable";
import { runAIDisputeReview } from "../../../../../lib/openai/dispute-resolver";
import { getAgent } from "../../../../../lib/sdk/agents";
import { getDispute } from "../../../../../lib/sdk/disputes";
import { getJobView } from "../../../../../lib/sdk/jobs";
import { createServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";
import { toSupabaseJson } from "../../../../../lib/supabase/indexed-data";

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

async function loadLatestReview(disputeId: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("ai_dispute_reviews")
    .select("*")
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(safeSupabaseMessage(error));
  return data;
}

export async function GET(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  try {
    const { disputeId } = await context.params;
    const review = await loadLatestReview(disputeId);
    if (!review && process.env.AUTO_RUN_AI_DISPUTE_REVIEW === "true") {
      logger.info("api.disputes.aiReview", "read:autoRun", { disputeId }, "No saved AI dispute review found; starting configured automatic review");
      return POST(new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRegenerate: false })
      }), { params: Promise.resolve({ disputeId }) });
    }
    return NextResponse.json({ ok: true, review: review ?? null });
  } catch (error) {
    logger.warn("api.disputes.aiReview", "read:failed", { error }, "AI dispute review read failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load AI dispute review." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await context.params;
  logger.info("api.disputes.aiReview", "create:received", { disputeId }, "AI dispute review request received");
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const supabase = createServiceRoleSupabaseClient();
    if (body.forceRegenerate !== true) {
      const existing = await loadLatestReview(disputeId);
      if (existing) {
        return NextResponse.json({ ok: true, reused: true, review: existing, message: "Existing AI dispute review reused. Use Force Re-review to request a new judgment." });
      }
    }

    const dispute = await getDispute(disputeId);
    const job = await getJobView(dispute.jobId);
    const agent = await getAgent(job.agentId);
    const decodedJob = decodeJobURI(job.jobURI);
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

    const aiContext = toSupabaseJson({
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
      evidence: dispute.evidenceURI || "No evidence URI submitted.",
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
    const reviewURI = `arcpilot://ai-dispute-review/dispute-${disputeId}-${Date.now()}`;
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
      reviewed_payload: toSupabaseJson({
        disputeId,
        jobId: dispute.jobId,
        agentId: job.agentId,
        reasonURI: dispute.reasonURI,
        evidenceURI: dispute.evidenceURI,
        deliverableURI,
        deliverableHash,
        jobTitle: decodedJob?.title ?? null,
        rejectionCategory: disputeMetadata?.category ?? null
      }),
      review_uri: reviewURI
    };
    const { data: saved, error } = await supabase.from("ai_dispute_reviews").insert(insertRow).select("*").single();
    if (error || !saved) throw new Error(safeSupabaseMessage(error));
    logger.info("api.disputes.aiReview", "create:success", {
      disputeId,
      recommendedOutcome: saved.recommended_outcome,
      confidence: saved.confidence
    }, "AI dispute review saved");
    return NextResponse.json({ ok: true, reused: false, review: saved });
  } catch (error) {
    logger.error("api.disputes.aiReview", "create:failed", { disputeId, error }, "AI dispute review request failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AI dispute review failed." }, { status: 500 });
  }
}
