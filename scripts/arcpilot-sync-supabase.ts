import { loadEnvFiles } from "../lib/contracts/runtime";
import { findLocalDeliverableForJob } from "../lib/openai/deliverable";
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

  const warnings: SyncWarning[] = [];
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

  for (const agent of agents) {
    const result = await upsertIndexedAgent(agent as unknown as Record<string, unknown>);
    if (!result.ok) warnings.push({ scope: "indexed_agents", id: agent.agentId.toString(), reason: result.reason || "unknown write error" });

    const event = await insertAppEvent({
      event_type: "agent_state_synced",
      source: "script",
      payload: eventPayload("agent", agent.agentId, {
        owner: agent.owner,
        name: agent.name,
        category: agent.category,
        active: agent.active
      })
    });
    if (!event.ok) warnings.push({ scope: "app_events", id: `agent:${agent.agentId.toString()}`, reason: event.reason || "event write skipped" });
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
    if (!result.ok) warnings.push({ scope: "indexed_jobs", id: job.jobId.toString(), reason: result.reason || "unknown write error" });

    const event = await insertAppEvent({
      event_type: "job_state_synced",
      source: "script",
      payload: eventPayload("job", job.jobId, {
        agentId: job.agentId,
        client: job.client,
        status: job.status,
        statusLabel: job.statusLabel,
        deliverableURI: onchainURI ?? saved?.deliverableURI ?? null
      })
    });
    if (!event.ok) warnings.push({ scope: "app_events", id: `job:${job.jobId.toString()}`, reason: event.reason || "event write skipped" });
  }

  for (const dispute of disputes) {
    const result = await upsertIndexedDispute(dispute as unknown as Record<string, unknown>);
    if (!result.ok) warnings.push({ scope: "indexed_disputes", id: dispute.disputeId.toString(), reason: result.reason || "unknown write error" });

    const event = await insertAppEvent({
      event_type: "dispute_state_synced",
      source: "script",
      payload: eventPayload("dispute", dispute.disputeId, {
        jobId: dispute.jobId,
        openedBy: dispute.openedBy,
        outcome: dispute.outcome,
        resolved: dispute.resolved
      })
    });
    if (!event.ok) warnings.push({ scope: "app_events", id: `dispute:${dispute.disputeId.toString()}`, reason: event.reason || "event write skipped" });
  }

  const summaryEvent = await insertAppEvent({
    event_type: "supabase_sync",
    source: "script",
    payload: toSupabaseJson({
      agents: agents.length,
      jobs: jobs.length,
      disputes: disputes.length,
      warnings: warnings.length
    })
  });
  if (!summaryEvent.ok) warnings.push({ scope: "app_events", id: "supabase_sync", reason: summaryEvent.reason || "summary event write skipped" });

  console.log(`Synced ${agents.length} agents, ${jobs.length} jobs, and ${disputes.length} disputes from contract counters.`);
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
