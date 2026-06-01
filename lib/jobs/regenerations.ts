import { logger } from "../logger";
import { createServiceRoleSupabaseClient, getOptionalServiceRoleSupabaseClient } from "../supabase/server";
import { toSupabaseJson } from "../supabase/indexed-data";

const CHAIN_ID = 5042002;

export type JobRegenerationSummary = {
  attemptsUsed: number;
  maxAttempts: number;
  remainingAttempts: number;
  feeUsdc: string;
  feeEnforced: false;
};

function configuredMaxAttempts() {
  const parsed = Number(process.env.ARC_MAX_REGENERATIONS_PER_JOB || "1");
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 1;
}

export function regenerationSummary(attemptsUsed: number): JobRegenerationSummary {
  const maxAttempts = configuredMaxAttempts();
  return {
    attemptsUsed,
    maxAttempts,
    remainingAttempts: Math.max(0, maxAttempts - attemptsUsed),
    feeUsdc: process.env.ARC_REGENERATION_FEE_USDC || "0",
    feeEnforced: false
  };
}

export function assertRegenerationAvailable(summary: JobRegenerationSummary) {
  if (summary.remainingAttempts <= 0) {
    throw new Error("Regeneration limit reached for this job.");
  }
}

export async function getJobRegenerationSummary(jobId: string | number | bigint) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return regenerationSummary(0);
  const { count, error } = await supabase
    .from("job_regenerations")
    .select("*", { count: "exact", head: true })
    .eq("chain_id", CHAIN_ID)
    .eq("job_id", String(jobId));
  if (error) throw new Error(`Regeneration storage is not configured. Apply lib/supabase/schema.sql in Supabase. ${error.message}`);
  return regenerationSummary(count ?? 0);
}

export async function reserveJobRegeneration(input: {
  jobId: string | number | bigint;
  agentId: string | number | bigint;
  requestedByWallet: string;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const summary = await getJobRegenerationSummary(input.jobId);
  assertRegenerationAvailable(summary);
  const attemptNumber = summary.attemptsUsed + 1;
  const { data, error } = await supabase
    .from("job_regenerations")
    .insert({
      chain_id: CHAIN_ID,
      job_id: String(input.jobId),
      agent_id: String(input.agentId),
      requested_by_wallet: input.requestedByWallet.toLowerCase(),
      attempt_number: attemptNumber,
      raw: toSupabaseJson({ state: "reserved" })
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    if (error?.code === "23505") throw new Error("Regeneration limit reached for this job.");
    throw new Error(`Regeneration attempt could not be reserved. ${error?.message || "Unknown Supabase error."}`);
  }
  logger.info("jobs.regenerations", "reserve:success", { jobId: input.jobId, attemptNumber }, "Job regeneration attempt reserved");
  return { id: String(data.id), attemptNumber, summary: regenerationSummary(attemptNumber) };
}

export async function completeJobRegeneration(id: string, deliverableHash: string, deliverableURI: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("job_regenerations")
    .update({
      deliverable_hash: deliverableHash,
      deliverable_uri: deliverableURI,
      raw: toSupabaseJson({ state: "completed" })
    })
    .eq("id", id);
  if (error) throw new Error(`Regeneration result could not be recorded. ${error.message}`);
}
