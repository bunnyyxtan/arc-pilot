import { buildDisputeListFromEvents } from "../../../lib/indexer/disputes";
import { logger } from "../../../lib/logger";
import { getIndexedDisputes, upsertIndexedDispute } from "../../../lib/supabase/indexed-data";
import { getOptionalServiceRoleSupabaseClient } from "../../../lib/supabase/server";
import { fail, ok } from "../_utils";

async function withManualReviewStatus(disputes: Array<Record<string, unknown>>) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase || disputes.length === 0) return disputes;
  const { data, error } = await supabase
    .from("manual_review_requests")
    .select("dispute_id,status,created_at")
    .order("created_at", { ascending: false });
  if (error) {
    logger.warn("api.disputes", "manualReviewStatus:unavailable", { error }, "Manual review indicators could not be loaded");
    return disputes;
  }
  const latestByDispute = new Map<string, string>();
  for (const request of data ?? []) {
    const key = String(request.dispute_id);
    if (!latestByDispute.has(key)) latestByDispute.set(key, String(request.status));
  }
  return disputes.map((dispute) => ({
    ...dispute,
    manualReviewStatus: latestByDispute.get(String(dispute.disputeId)) ?? null
  }));
}

export async function GET() {
  logger.info("api.disputes", "list:received", {}, "Dispute list request received");
  try {
    const indexedDisputes = await getIndexedDisputes();
    if (indexedDisputes.length > 0) {
      logger.info("api.disputes", "list:supabaseSuccess", { count: indexedDisputes.length }, "Dispute list loaded from Supabase");
      return ok({ disputes: await withManualReviewStatus(indexedDisputes as Array<Record<string, unknown>>), source: "supabase" });
    }

    const disputes = await buildDisputeListFromEvents();
    await Promise.all(disputes.map((dispute) => upsertIndexedDispute(dispute as unknown as Record<string, unknown>)));
    logger.info("api.disputes", "list:success", { count: disputes.length, source: "indexer" }, "Dispute list request completed");
    return ok({ disputes: await withManualReviewStatus(disputes as unknown as Array<Record<string, unknown>>), source: "indexer" });
  } catch (error) {
    return fail(error, 500, "api.disputes", "list");
  }
}
