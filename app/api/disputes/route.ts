import { buildDisputeListFromEvents } from "../../../lib/indexer/disputes";
import { logger } from "../../../lib/logger";
import { getIndexedDisputes, upsertIndexedDispute } from "../../../lib/supabase/indexed-data";
import { getOptionalServiceRoleSupabaseClient } from "../../../lib/supabase/server";
import { fail, ok } from "../_utils";

async function withDisputeEnrichment(disputes: Array<Record<string, unknown>>) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase || disputes.length === 0) return disputes;

  const disputeIds = disputes.map((d) => String(d.disputeId));

  // Fetch latest active AI review per dispute
  const { data: reviews, error: reviewError } = await supabase
    .from("ai_dispute_reviews")
    .select("dispute_id,recommended_outcome")
    .eq("is_active", true)
    .in("dispute_id", disputeIds)
    .order("created_at", { ascending: false });

  if (reviewError) {
    logger.warn("api.disputes", "aiReviews:unavailable", { error: reviewError }, "AI review data could not be loaded");
  }

  const latestReviewByDispute = new Map<string, string>();
  for (const review of reviews ?? []) {
    const key = String(review.dispute_id);
    if (!latestReviewByDispute.has(key)) latestReviewByDispute.set(key, String(review.recommended_outcome));
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
    const indexedDisputes = await getIndexedDisputes();
    if (indexedDisputes.length > 0) {
      logger.info("api.disputes", "list:supabaseSuccess", { count: indexedDisputes.length }, "Dispute list loaded from Supabase");
      return ok({ disputes: await withDisputeEnrichment(indexedDisputes as Array<Record<string, unknown>>), source: "supabase" });
    }

    const disputes = await buildDisputeListFromEvents();
    await Promise.all(disputes.map((dispute) => upsertIndexedDispute(dispute as unknown as Record<string, unknown>)));
    logger.info("api.disputes", "list:success", { count: disputes.length, source: "indexer" }, "Dispute list request completed");
    return ok({ disputes: await withDisputeEnrichment(disputes as unknown as Array<Record<string, unknown>>), source: "indexer" });
  } catch (error) {
    return fail(error, 500, "api.disputes", "list");
  }
}
