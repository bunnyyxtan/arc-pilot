import { getJobView } from "../../../../lib/sdk/jobs";
import { logger } from "../../../../lib/logger";
import { getIndexedJob } from "../../../../lib/supabase/indexed-data";
import { fail, ok, routeBigInt } from "../../_utils";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const id = routeBigInt(jobId, "jobId");
    logger.info("api.jobs", "read:received", { jobId: id }, "Job read request received");
    const indexedJob = await getIndexedJob<Record<string, unknown>>(id);
    let job = indexedJob;
    try {
      const liveJob = await getJobView(id);
      job = { ...(indexedJob ?? {}), ...liveJob };
    } catch (error) {
      if (!indexedJob) throw error;
      logger.warn("api.jobs", "read:onchainFallback", { jobId: id, error }, "Using indexed job after Arc Testnet read failed");
    }
    logger.info("api.jobs", "read:success", { jobId: id }, "Job read request completed");
    return ok({ job, source: indexedJob ? "indexed+onchain" : "onchain" });
  } catch (error) {
    return fail(error, 500, "api.jobs", "read");
  }
}
