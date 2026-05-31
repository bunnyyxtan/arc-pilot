import { buildDisputeListFromEvents } from "../../../lib/indexer/disputes";
import { logger } from "../../../lib/logger";
import { getIndexedDisputes, upsertIndexedDispute } from "../../../lib/supabase/indexed-data";
import { fail, ok } from "../_utils";

export async function GET() {
  logger.info("api.disputes", "list:received", {}, "Dispute list request received");
  try {
    const indexedDisputes = await getIndexedDisputes();
    if (indexedDisputes.length > 0) {
      logger.info("api.disputes", "list:supabaseSuccess", { count: indexedDisputes.length }, "Dispute list loaded from Supabase");
      return ok({ disputes: indexedDisputes, source: "supabase" });
    }

    const disputes = await buildDisputeListFromEvents();
    await Promise.all(disputes.map((dispute) => upsertIndexedDispute(dispute as unknown as Record<string, unknown>)));
    logger.info("api.disputes", "list:success", { count: disputes.length, source: "indexer" }, "Dispute list request completed");
    return ok({ disputes, source: "indexer" });
  } catch (error) {
    return fail(error, 500, "api.disputes", "list");
  }
}
