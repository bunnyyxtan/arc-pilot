import { submitDeliverable } from "../../../../../lib/sdk/jobs";
import { logger } from "../../../../../lib/logger";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  try {
    const { jobId } = await context.params;
    const body = await readJson(request);
    const deliverableURI = String(body.deliverableURI || "");
    const id = routeBigInt(jobId, "jobId");
    logger.info("api.jobs.submit", "submit:received", { jobId: id, deliverableURI }, "Deliverable submit request received");
    const result = await submitDeliverable(id, deliverableURI, bodyPrivateKey(body, "DEMO_AGENT_OWNER_PRIVATE_KEY"));
    logger.info("api.jobs.submit", "submit:success", { jobId: id, txHash: result.txHash }, "Deliverable submitted");
    return ok({
      result
    });
  } catch (error) {
    return fail(error, 400, "api.jobs.submit", "submit");
  }
}
