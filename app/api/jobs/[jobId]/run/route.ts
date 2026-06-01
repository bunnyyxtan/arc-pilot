import { decodeJobURI } from "../../../../../lib/contracts/job-uri";
import { getVerifiedWalletFromRequest } from "../../../../../lib/auth/wallet-session";
import { normalizeWallet } from "../../../../../lib/deliverables/access";
import { logger } from "../../../../../lib/logger";
import { runAgentJob } from "../../../../../lib/openai/agent-runner";
import { hashFromDeliverableURI, findLocalDeliverableForJob } from "../../../../../lib/openai/deliverable";
import { isDeliverableType } from "../../../../../lib/openai/prompts";
import { getAgent } from "../../../../../lib/sdk/agents";
import { getJob } from "../../../../../lib/sdk/jobs";
import { submitDeliverable } from "../../../../../lib/sdk/jobs";
import { getIndexedJobDeliverable, getLatestDeliverableForJob } from "../../../../../lib/supabase/indexed-data";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  // Local/demo only when autoSubmit is true. Do not use server private-key writes in production frontend.
  logger.info("api.jobs.run", "run:received", {}, "Job agent-run request received");
  try {
    const { jobId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(jobId, "jobId");
    logger.info("api.jobs.run", "run:loadJob", { jobId: id }, "Loading job and agent context");
    const job = await getJob(id);
    const agent = await getAgent(job.agentId);
    const decoded = decodeJobURI(job.jobURI);
    const verifiedWallet = normalizeWallet(getVerifiedWalletFromRequest(request));
    if (!verifiedWallet) {
      return fail(new Error("Verify the connected agent-owner wallet session before running the AI agent."), 401, "api.jobs.run", "run");
    }
    if (verifiedWallet !== normalizeWallet(String(agent.owner))) {
      return fail(new Error("The verified wallet session is not the registered agent owner."), 403, "api.jobs.run", "run");
    }

    if (body.forceRegenerate !== true) {
      const existing = typeof job.deliverableURI === "string" && job.deliverableURI
        ? {
            source: "onchain" as const,
            deliverableURI: job.deliverableURI,
            deliverableHash: hashFromDeliverableURI(job.deliverableURI),
            visibility: decoded?.deliverableVisibility === "public" ? "public" as const : "restricted" as const
          }
        : await getIndexedJobDeliverable(id)
          ?? await getLatestDeliverableForJob(id)
          ?? await findLocalDeliverableForJob(id);

      if (existing?.deliverableURI) {
        logger.info("api.jobs.run", "run:reuseExisting", {
          jobId: id,
          source: existing.source,
          deliverableHash: existing.deliverableHash
        }, "Existing job deliverable reused without calling OpenAI");
        return ok({
          reused: true,
          source: existing.source,
          deliverableURI: existing.deliverableURI,
          deliverableHash: existing.deliverableHash,
          message: "Existing deliverable reused. Use forceRegenerate to generate a new one.",
          deliverable: {
            deliverableURI: existing.deliverableURI,
            deliverableHash: existing.deliverableHash,
            visibility: existing.visibility
          }
        });
      }
    }

    const deliverableType = body.deliverableType || "general";
    if (!isDeliverableType(deliverableType)) {
      logger.warn("api.jobs.run", "run:invalidDeliverableType", { jobId: id, deliverableType }, "Invalid deliverable type");
      throw new Error("deliverableType must be research, content, code, or general.");
    }

    const jobTitle = decoded?.title || String(body.jobTitle || `Job ${id.toString()}`);
    const jobDescription = decoded?.description || String(body.jobDescription || job.jobURI);
    logger.info("api.jobs.run", "run:agentRunnerStart", {
      jobId: id,
      agentId: job.agentId,
      deliverableType,
      jobTitle,
      jobDescription,
      source: decoded ? "onchain_job_uri" : "legacy_fallback"
    }, "Calling OpenAI agent runner for job");
    const deliverable = await runAgentJob({
      agentName: String(body.agentName || agent.name),
      agentCategory: String(body.agentCategory || agent.category),
      jobTitle,
      jobDescription,
      deliverableType,
      chainId: typeof body.chainId === "number" ? body.chainId : typeof body.chainId === "string" && body.chainId ? Number(body.chainId) : null,
      jobId: id.toString(),
      agentId: job.agentId.toString(),
      createdByWallet: verifiedWallet,
      txHash: typeof body.txHash === "string" ? body.txHash : null,
      visibility: decoded?.deliverableVisibility === "public" ? "public" : "restricted",
      clientWallet: String(job.client || ""),
      agentOwnerWallet: String(agent.owner || ""),
      evaluatorWallet: String(job.evaluator || "")
    });

    let submitResult: unknown;
    if (body.autoSubmit === true) {
      logger.info("api.jobs.run", "run:autoSubmitStart", { jobId: id, deliverableURI: deliverable.deliverableURI }, "Submitting deliverable URI onchain");
      submitResult = await submitDeliverable(id, deliverable.deliverableURI, bodyPrivateKey(body, "DEMO_AGENT_OWNER_PRIVATE_KEY"));
    }

    logger.info("api.jobs.run", "run:success", { jobId: id, deliverableHash: deliverable.deliverableHash, autoSubmitted: body.autoSubmit === true }, "Job agent-run request completed");
    return ok({
      deliverable: {
        deliverableHash: deliverable.deliverableHash,
        deliverableURI: deliverable.deliverableURI,
        visibility: decoded?.deliverableVisibility === "public" ? "public" : "restricted"
      },
      submitResult
    });
  } catch (error) {
    return fail(error, 400, "api.jobs.run", "run");
  }
}
