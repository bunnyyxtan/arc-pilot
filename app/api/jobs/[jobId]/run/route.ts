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
import { getIndexedJob, getIndexedJobDeliverable, getLatestDeliverableForJob } from "../../../../../lib/supabase/indexed-data";
import { getOptionalServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";
import { loadAgentScopeProfile } from "../../../../../lib/agents/profile";
import { completeJobRegeneration, reserveJobRegeneration } from "../../../../../lib/jobs/regenerations";
import { JOB_STATUS, getJobStatusLabel, normalizeJobStatus } from "../../../../../lib/jobs/status";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

const activeJobRuns = new Set<string>();
const JOB_RUN_LOCK_TTL_MS = 10 * 60 * 1000;

type ActiveJobRunLock = {
  key: string;
  source: "supabase" | "memory";
};

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  return error?.code === "23505" || Boolean(error?.message?.toLowerCase().includes("duplicate key"));
}

async function claimActiveJobRun(jobId: bigint, requestedByWallet: string): Promise<ActiveJobRunLock | null> {
  const key = `job_generation:${jobId.toString()}`;
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) {
    if (activeJobRuns.has(key)) return null;
    activeJobRuns.add(key);
    return { key, source: "memory" };
  }

  const row = {
    event_type: "job_generation_lock",
    source: "api.jobs.run",
    event_key: key,
    payload: {
      jobId: jobId.toString(),
      requestedByWallet,
      startedAt: new Date().toISOString()
    }
  };
  const insert = () => supabase.from("app_events").insert(row);
  const { error } = await insert();
  if (!error) return { key, source: "supabase" };
  if (!isUniqueViolation(error)) {
    throw new Error(`Unable to reserve AI output generation: ${error.message}`);
  }

  const { data: existing, error: readError } = await supabase
    .from("app_events")
    .select("created_at")
    .eq("event_key", key)
    .maybeSingle();
  if (readError) throw new Error(`Unable to inspect AI output generation lock: ${readError.message}`);

  const createdAt = Date.parse(String(existing?.created_at || ""));
  if (Number.isFinite(createdAt) && Date.now() - createdAt > JOB_RUN_LOCK_TTL_MS) {
    const { error: deleteError } = await supabase.from("app_events").delete().eq("event_key", key);
    if (deleteError) throw new Error(`Unable to clear stale AI output generation lock: ${deleteError.message}`);
    const retry = await insert();
    if (!retry.error) return { key, source: "supabase" };
    if (!isUniqueViolation(retry.error)) {
      throw new Error(`Unable to reserve AI output generation: ${retry.error.message}`);
    }
  }

  return null;
}

async function releaseActiveJobRun(lock: ActiveJobRunLock) {
  if (lock.source === "memory") {
    activeJobRuns.delete(lock.key);
    return;
  }
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) {
    logger.warn("api.jobs.run", "run:lockReleaseSkipped", { eventKey: lock.key }, "Supabase generation lock could not be released");
    return;
  }
  const { error } = await supabase.from("app_events").delete().eq("event_key", lock.key);
  if (error) {
    logger.warn("api.jobs.run", "run:lockReleaseFailed", { eventKey: lock.key, error }, "Supabase generation lock release failed");
  }
}

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
    const indexedJob = await getIndexedJob<Record<string, unknown>>(id);
    const liveStatus = normalizeJobStatus(job.status);
    logger.info("api.jobs.run", "run:liveState", {
      jobId: id,
      liveStatus,
      liveStatusLabel: getJobStatusLabel(job.status),
      mappedStatus: JOB_STATUS.RUNNING,
      indexedStatus: indexedJob?.status ?? null,
      indexedStatusLabel: indexedJob?.statusLabel ?? null
    }, "Loaded live onchain job state for AI run");
    const verifiedWallet = normalizeWallet(getVerifiedWalletFromRequest(request));
    if (!verifiedWallet) {
      return fail(new Error("Verify the connected agent-owner wallet session before running the AI agent."), 401, "api.jobs.run", "run");
    }
    if (verifiedWallet !== normalizeWallet(String(agent.owner))) {
      return fail(new Error("The verified wallet session is not the registered agent owner."), 403, "api.jobs.run", "run");
    }
    if (liveStatus !== JOB_STATUS.RUNNING) {
      return fail(new Error("AI output can be generated only while the job is Running."), 409, "api.jobs.run", "run");
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

    const activeRun = await claimActiveJobRun(id, verifiedWallet);
    if (!activeRun) {
      return fail(new Error("AI output generation is already in progress for this job."), 409, "api.jobs.run", "run");
    }

    try {
      const regeneration = body.forceRegenerate === true
        ? await reserveJobRegeneration({
            jobId: id,
            agentId: job.agentId,
            requestedByWallet: verifiedWallet
          })
        : null;

      const deliverableType = body.deliverableType || "general";
      if (!isDeliverableType(deliverableType)) {
        logger.warn("api.jobs.run", "run:invalidDeliverableType", { jobId: id, deliverableType }, "Invalid deliverable type");
        throw new Error("deliverableType must be research, content, code, or general.");
      }

      const jobTitle = decoded?.title || String(body.jobTitle || `Job ${id.toString()}`);
      const jobDescription = decoded?.description || String(body.jobDescription || job.jobURI);
      const scopeProfile = await loadAgentScopeProfile(agent);
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
        evaluatorWallet: String(job.evaluator || ""),
        jobClassification: decoded?.jobClassification ?? decoded?.jobMode,
        agentSkills: scopeProfile.skills,
        agentMetadata: scopeProfile.metadata
      });
      if (regeneration) {
        await completeJobRegeneration(regeneration.id, deliverable.deliverableHash, deliverable.deliverableURI);
      }

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
          visibility: decoded?.deliverableVisibility === "public" ? "public" : "restricted",
          refusedOutOfScope: deliverable.refusedOutOfScope === true,
          scopeDecision: deliverable.scopeDecision
        },
        message: deliverable.refusedOutOfScope ? "Task outside agent scope. ArcPilot saved a refusal deliverable for review." : undefined,
        regeneration: regeneration?.summary,
        submitResult
      });
    } finally {
      await releaseActiveJobRun(activeRun);
    }
  } catch (error) {
    return fail(error, 400, "api.jobs.run", "run");
  }
}
