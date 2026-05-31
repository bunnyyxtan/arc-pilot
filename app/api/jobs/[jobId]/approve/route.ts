import { approveJob } from "../../../../../lib/sdk/jobs";
import { logger } from "../../../../../lib/logger";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  try {
    const { jobId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(jobId, "jobId");
    logger.info("api.jobs.approve", "approve:received", { jobId: id }, "Job approval request received");
    const result = await approveJob(id, bodyPrivateKey(body, "DEMO_CLIENT_PRIVATE_KEY"));
    logger.info("api.jobs.approve", "approve:success", { jobId: id, txHash: result.txHash }, "Job approved and released");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.jobs.approve", "approve");
  }
}
