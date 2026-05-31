import { getJobView } from "../../../../lib/sdk/jobs";
import { logger } from "../../../../lib/logger";
import { fail, ok, routeBigInt } from "../../_utils";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const id = routeBigInt(jobId, "jobId");
    logger.info("api.jobs", "read:received", { jobId: id }, "Job read request received");
    const job = await getJobView(id);
    logger.info("api.jobs", "read:success", { jobId: id }, "Job read request completed");
    return ok({ job });
  } catch (error) {
    return fail(error, 500, "api.jobs", "read");
  }
}
