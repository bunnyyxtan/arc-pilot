import { loadEnvFiles } from "../lib/contracts/runtime";
import { backfillLocalDeliverablesToSupabase, findLocalDeliverableForJob } from "../lib/openai/deliverable";
import { getAgentView, getTotalAgents } from "../lib/sdk/agents";
import { getDispute, getTotalDisputes } from "../lib/sdk/disputes";
import { getJobView, getTotalJobs } from "../lib/sdk/jobs";
import {
  getIndexedJobDeliverable,
  getLatestDeliverableForJob,
  insertAppEvent,
  toSupabaseJson,
  upsertIndexedAgent,
  upsertIndexedDispute,
  upsertIndexedJob
} from "../lib/supabase/indexed-data";
import { createServiceRoleSupabaseClient } from "../lib/supabase/server";

type SyncWarning = {
  scope: string;
  id?: string;
  reason: string;
};

function reportWriteResult(warnings: SyncWarning[], scope: string, id: string, result: { ok: boolean; reason?: string }, fallback: string) {
  if (!result.ok || result.reason) {
    warnings.push({ scope, id, reason: result.reason || fallback });
  }
}

function requireSupabaseEnv() {
  loadEnvFiles();
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing Supabase environment variables: ${missing.join(", ")}.`);
  }
  createServiceRoleSupabaseClient();
}

async function collectRange<T>(
  label: string,
  total: bigint,
  read: (id: bigint) => Promise<T>,
  warnings: SyncWarning[]
) {
  const rows: T[] = [];
  for (let id = 1n; id <= total; id += 1n) {
    try {
      rows.push(await read(id));
    } catch (error) {
      warnings.push({
        scope: label,
        id: id.toString(),
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return rows;
}

function eventPayload(entity: string, id: bigint | string, payload: Record<string, unknown>) {
  return toSupabaseJson({
    entity,
    entityId: String(id),
    ...payload
  });
}

async function main() {
  requireSupabaseEnv();
  console.log("Syncing real ArcPilot state to Supabase...");
  const supabase = createServiceRoleSupabaseClient();

  const warnings: SyncWarning[] = [];
  const deliverableBackfill = await backfillLocalDeliverablesToSupabase();
  for (const reason of deliverableBackfill.warnings) {
    warnings.push({ scope: "deliverable_backfill", reason });
  }
  const [totalAgents, totalJobs, totalDisputes] = await Promise.all([
    getTotalAgents(),
    getTotalJobs(),
    getTotalDisputes()
  ]);

  console.log(`Counters: agents=${totalAgents.toString()}, jobs=${totalJobs.toString()}, disputes=${totalDisputes.toString()}`);

  const [agents, jobs, disputes] = await Promise.all([
    collectRange("agent", totalAgents, (id) => getAgentView(id), warnings),
    collectRange("job", totalJobs, (id) => getJobView(id), warnings),
    collectRange("dispute", totalDisputes, (id) => getDispute(id), warnings)
  ]);
  const { data: metadataRows, error: metadataError } = await supabase.from("agent_metadata").select("metadata_uri");
  if (metadataError) warnings.push({ scope: "agent_metadata", reason: metadataError.message });
  const metadataURIs = new Set((metadataRows ?? []).map((row) => String(row.metadata_uri || "")));
  const metadataMissing = agents.filter((agent) => agent.metadataURI && !metadataURIs.has(String(agent.metadataURI)));
  let indexedAgentsUpserted = 0;
  let indexedJobsUpserted = 0;
  let indexedDisputesUpserted = 0;
  let deliverablesLinked = 0;

  for (const agent of agents) {
    const result = await upsertIndexedAgent(agent as unknown as Record<string, unknown>);
    if (result.ok) indexedAgentsUpserted += 1;
    reportWriteResult(warnings, "indexed_agents", agent.agentId.toString(), result, "unknown write error");

    const event = await insertAppEvent({
      event_type: "agent_state_synced",
      event_key: `agent_state_synced:${agent.agentId.toString()}`,
      source: "script",
      payload: eventPayload("agent", agent.agentId, {
        owner: agent.owner,
        name: agent.name,
        category: agent.category,
        active: agent.active
      })
    });
    reportWriteResult(warnings, "app_events", `agent:${agent.agentId.toString()}`, event, "event write skipped");
  }

  for (const job of jobs) {
    const onchainURI = typeof job.deliverableURI === "string" && job.deliverableURI ? job.deliverableURI : null;
    const saved = onchainURI
      ? null
      : (await getIndexedJobDeliverable(job.jobId)) ?? (await getLatestDeliverableForJob(job.jobId)) ?? (await findLocalDeliverableForJob(job.jobId));

    const result = await upsertIndexedJob({
      ...job,
      chainId: 5042002,
      deliverableURI: onchainURI ?? saved?.deliverableURI ?? null,
      deliverableHash: saved?.deliverableHash ?? null,
      visibility: saved?.visibility ?? null
    } as unknown as Record<string, unknown>);
    if (result.ok) indexedJobsUpserted += 1;
    reportWriteResult(warnings, "indexed_jobs", job.jobId.toString(), result, "unknown write error");
    if (onchainURI ?? saved?.deliverableURI) deliverablesLinked += 1;

    const event = await insertAppEvent({
      event_type: "job_state_synced",
      event_key: `job_state_synced:${job.jobId.toString()}`,
      source: "script",
      payload: eventPayload("job", job.jobId, {
        agentId: job.agentId,
        client: job.client,
        status: job.status,
        statusLabel: job.statusLabel,
        deliverableURI: onchainURI ?? saved?.deliverableURI ?? null
      })
    });
    reportWriteResult(warnings, "app_events", `job:${job.jobId.toString()}`, event, "event write skipped");
  }

  for (const dispute of disputes) {
    const result = await upsertIndexedDispute(dispute as unknown as Record<string, unknown>);
    if (result.ok) indexedDisputesUpserted += 1;
    reportWriteResult(warnings, "indexed_disputes", dispute.disputeId.toString(), result, "unknown write error");

    const event = await insertAppEvent({
      event_type: "dispute_state_synced",
      event_key: `dispute_state_synced:${dispute.disputeId.toString()}`,
      source: "script",
      payload: eventPayload("dispute", dispute.disputeId, {
        jobId: dispute.jobId,
        openedBy: dispute.openedBy,
        outcome: dispute.outcome,
        resolved: dispute.resolved
      })
    });
    reportWriteResult(warnings, "app_events", `dispute:${dispute.disputeId.toString()}`, event, "event write skipped");
  }

  const summaryEvent = await insertAppEvent({
    event_type: "supabase_sync",
    event_key: "supabase_sync:latest",
    source: "script",
    payload: toSupabaseJson({
      agents: agents.length,
      jobs: jobs.length,
      disputes: disputes.length,
      warnings: warnings.length
    })
  });
  reportWriteResult(warnings, "app_events", "supabase_sync", summaryEvent, "summary event write skipped");

  console.log("Supabase sync complete");
  console.log(`Onchain agents found: ${agents.length}`);
  console.log(`indexed_agents upserted: ${indexedAgentsUpserted}`);
  console.log(`agent_metadata rows matched: ${agents.length - metadataMissing.length}`);
  console.log(`agent metadata missing: ${metadataMissing.length ? metadataMissing.map((agent) => `agent #${agent.agentId.toString()}`).join(", ") : "none"}`);
  console.log(`Onchain jobs found: ${jobs.length}`);
  console.log(`indexed_jobs upserted: ${indexedJobsUpserted}`);
  console.log(`Disputes found: ${disputes.length}`);
  console.log(`indexed_disputes upserted: ${indexedDisputesUpserted}`);
  console.log(`Deliverables linked: ${deliverablesLinked}`);
  console.log(`Local deliverables found for Supabase backfill: ${deliverableBackfill.found}`);
  console.log(`Local deliverables saved to Supabase: ${deliverableBackfill.saved}`);
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const warning of warnings.slice(0, 12)) {
      console.log(`- ${warning.scope}${warning.id ? ` ${warning.id}` : ""}: ${warning.reason}`);
    }
    if (warnings.length > 12) console.log(`- ...and ${warnings.length - 12} more warnings.`);
    console.log("Sync completed with warnings. If column-related warnings appear, apply lib/supabase/schema.sql to Supabase.");
  } else {
    console.log("Sync completed without warnings.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
