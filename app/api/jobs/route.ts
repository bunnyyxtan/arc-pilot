import { buildJobListFromEvents } from "../../../lib/indexer/jobs";
import { parseUsdc } from "../../../lib/format/usdc";
import { logger } from "../../../lib/logger";
import { createJob } from "../../../lib/sdk/jobs";
import { getIndexedJobs, upsertIndexedJob } from "../../../lib/supabase/indexed-data";
import { bodyPrivateKey, fail, ok, readJson } from "../_utils";

export async function GET() {
  logger.info("api.jobs", "list:received", {}, "Job list request received");
  try {
    const indexedJobs = await getIndexedJobs();
    if (indexedJobs.length > 0) {
      logger.info("api.jobs", "list:supabaseSuccess", { count: indexedJobs.length }, "Job list loaded from Supabase");
      return ok({ jobs: indexedJobs, source: "supabase" });
    }

    const jobs = await buildJobListFromEvents();
    await Promise.all(jobs.map((job) => upsertIndexedJob(job as unknown as Record<string, unknown>)));
    logger.info("api.jobs", "list:success", { count: jobs.length, source: "indexer" }, "Job list request completed");
    return ok({ jobs, source: "indexer" });
  } catch (error) {
    return fail(error, 500, "api.jobs", "list");
  }
}

export async function POST(request: Request) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  logger.info("api.jobs", "create:received", {}, "Job creation request received");
  try {
    const body = await readJson(request);
    logger.debug("api.jobs", "create:input", {
      agentId: body.agentId,
      evaluator: body.evaluator,
      amountUsdc: body.amountUsdc || body.amount,
      clientBondUsdc: body.clientBondUsdc || body.clientBond,
      deadline: body.deadline
    }, "Job creation input prepared");
    const result = await createJob(
      {
        agentId: BigInt(String(body.agentId)),
        evaluator: body.evaluator as `0x${string}` | undefined,
        amount: parseUsdc(String(body.amountUsdc || body.amount || "0")),
        clientBond: parseUsdc(String(body.clientBondUsdc || body.clientBond || "0")),
        deadline: BigInt(String(body.deadline || Math.floor(Date.now() / 1000) + 3600)),
        jobURI: typeof body.jobURI === "string" ? body.jobURI : undefined,
        jobTitle: typeof body.jobTitle === "string" ? body.jobTitle : undefined,
        jobDescription: typeof body.jobDescription === "string" ? body.jobDescription : undefined
      },
      bodyPrivateKey(body, "DEMO_CLIENT_PRIVATE_KEY")
    );
    logger.info("api.jobs", "create:success", { txHash: result.txHash }, "Job creation completed");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.jobs", "create");
  }
}
