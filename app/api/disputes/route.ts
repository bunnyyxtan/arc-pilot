import { getDisputeListWithSelfHeal } from "../../../lib/indexer/dispute-sync";
import { logger } from "../../../lib/logger";
import { getOptionalServiceRoleSupabaseClient } from "../../../lib/supabase/server";
import { fail, ok } from "../_utils";

async function withDisputeEnrichment(disputes: Array<Record<string, unknown>>) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase || disputes.length === 0) return disputes;

  const disputeIds = disputes.map((d) => String(d.disputeId));

  // Fetch latest active AI review per dispute
  const { data: reviews, error: reviewError } = await supabase
    .from("ai_dispute_reviews")
    .select("dispute_id,recommended_outcome,guarded_recommendation")
    .eq("is_active", true)
    .in("dispute_id", disputeIds)
    .order("created_at", { ascending: false });

  if (reviewError) {
    logger.warn("api.disputes", "aiReviews:unavailable", { error: reviewError }, "AI review data could not be loaded");
  }

  const latestReviewByDispute = new Map<string, string>();
  for (const review of reviews ?? []) {
    const key = String(review.dispute_id);
    if (!latestReviewByDispute.has(key)) latestReviewByDispute.set(key, String(review.guarded_recommendation || review.recommended_outcome));
  }

  // Fetch evidence counts per dispute
  const { data: evidenceRows, error: evidenceError } = await supabase
    .from("dispute_evidence")
    .select("dispute_id")
    .in("dispute_id", disputeIds);

  if (evidenceError) {
    logger.warn("api.disputes", "evidenceCheck:unavailable", { error: evidenceError }, "Evidence data could not be loaded");
  }

  const disputesWithEvidence = new Set<string>();
  for (const row of evidenceRows ?? []) {
    disputesWithEvidence.add(String(row.dispute_id));
  }

  return disputes.map((dispute) => ({
    ...dispute,
    aiRecommendation: latestReviewByDispute.get(String(dispute.disputeId)) ?? null,
    hasEvidence: disputesWithEvidence.has(String(dispute.disputeId))
  }));
}

export async function GET() {
  logger.info("api.disputes", "list:received", {}, "Dispute list request received");
  try {
    const result = await getDisputeListWithSelfHeal("arcTestnet");
    logger.info("api.disputes", "list:success", {
      count: result.disputes.length,
      source: result.source,
      recoveredDisputeIds: result.recoveredDisputeIds
    }, "Dispute list request completed");
    return ok({
      disputes: await withDisputeEnrichment(result.disputes),
      source: result.source,
      warning: result.warning,
      recoveredDisputeIds: result.recoveredDisputeIds
    });
  } catch (error) {
    return fail(error, 500, "api.disputes", "list");
  }
}
