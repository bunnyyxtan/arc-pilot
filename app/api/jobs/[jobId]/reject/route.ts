import { rejectJob } from "../../../../../lib/sdk/jobs";
import { logger } from "../../../../../lib/logger";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  try {
    const { jobId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(jobId, "jobId");
    const reasonURI = String(body.reasonURI || "local-dispute://api-rejection");
    logger.info("api.jobs.reject", "reject:received", { jobId: id, reasonURI }, "Job rejection request received");
    const result = await rejectJob(id, reasonURI, bodyPrivateKey(body, "DEMO_CLIENT_PRIVATE_KEY"));
    logger.info("api.jobs.reject", "reject:success", { jobId: id, txHash: result.txHash }, "Job moved to dispute");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.jobs.reject", "reject");
  }
}
