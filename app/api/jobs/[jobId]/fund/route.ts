import { fundJob } from "../../../../../lib/sdk/jobs";
import { logger } from "../../../../../lib/logger";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  try {
    const { jobId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(jobId, "jobId");
    logger.info("api.jobs.fund", "fund:received", { jobId: id }, "Job fund request received");
    const result = await fundJob(id, bodyPrivateKey(body, "DEMO_CLIENT_PRIVATE_KEY"));
    logger.info("api.jobs.fund", "fund:success", { jobId: id, txHash: result.txHash, approveTxHash: result.approveTxHash }, "Job funded");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.jobs.fund", "fund");
  }
}
