import { logger } from "../logger";
import { getOptionalServiceRoleSupabaseClient } from "./server";
import type { AppEventRow, IndexedAgentRow, IndexedDisputeRow, IndexedJobRow, Json } from "./types";
import { formatAgentDisplayId } from "../design/agent-id";

type IndexedWriteResult = {
  ok: boolean;
  reason?: string;
};

let modernAppEventsSchema: boolean | null = null;

function reasonFromError(error: unknown) {
  if (!error) return "unknown";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return JSON.stringify(error);
}

function missingColumnFromError(error: unknown) {
  const reason = reasonFromError(error);
  return reason.match(/Could not find the '([^']+)' column/)?.[1] ?? null;
}

export function toSupabaseJson(value: unknown): Json {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSupabaseJson(item));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toSupabaseJson(item)])
    ) as Json;
  }
  return null;
}

function payloadFromRow<T>(row: { payload?: Json } | null): T | null {
  if (!row) return null;
  return (row.payload && typeof row.payload === "object" ? row.payload : row) as T;
}

async function safeWrite(label: string, write: () => PromiseLike<{ error: unknown }>): Promise<IndexedWriteResult> {
  try {
    const { error } = await write();
    if (error) {
      logger.warn("supabase.indexedData", `${label}:failed`, { error }, "Supabase indexed data write failed");
      return { ok: false, reason: reasonFromError(error) };
    }
    return { ok: true };
  } catch (error) {
    logger.warn("supabase.indexedData", `${label}:failed`, { error }, "Supabase indexed data write failed");
    return { ok: false, reason: reasonFromError(error) };
  }
}

async function safeUpsert(
  label: string,
  table: "indexed_agents" | "indexed_jobs" | "indexed_disputes",
  row: Record<string, unknown>,
  onConflict: string
): Promise<IndexedWriteResult> {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return { ok: false, reason: "Supabase is not configured." };
  const mutable = { ...row };
  const removedColumns: string[] = [];
  let replaceMode = false;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      let error: unknown;
      if (replaceMode) {
        const keyValue = mutable[onConflict];
        if (keyValue === undefined || keyValue === null || keyValue === "") {
          return { ok: false, reason: `Missing ${onConflict} for replacement write.` };
        }
        const deleteResult = await supabase.from(table).delete().eq(onConflict, String(keyValue));
        if (deleteResult.error) {
          logger.warn("supabase.indexedData", `${label}:replaceDeleteFailed`, { error: deleteResult.error }, "Supabase indexed data replace delete failed");
          return { ok: false, reason: reasonFromError(deleteResult.error) };
        }
        const insertResult = await supabase.from(table).insert(mutable);
        error = insertResult.error;
      } else {
        const result = await supabase.from(table).upsert(mutable, { onConflict });
        error = result.error;
      }

      if (!error) {
        return removedColumns.length > 0
          ? { ok: true, reason: `Skipped missing live-schema columns: ${removedColumns.join(", ")}` }
          : { ok: true };
      }

      const reason = reasonFromError(error);
      if (!replaceMode && reason.includes("there is no unique or exclusion constraint matching the ON CONFLICT specification")) {
        replaceMode = true;
        continue;
      }

      const missingColumn = missingColumnFromError(error);
      if (missingColumn && missingColumn in mutable) {
        delete mutable[missingColumn];
        removedColumns.push(missingColumn);
        continue;
      }

      logger.warn("supabase.indexedData", `${label}:failed`, { error }, "Supabase indexed data write failed");
      return { ok: false, reason: reasonFromError(error) };
    } catch (error) {
      logger.warn("supabase.indexedData", `${label}:failed`, { error }, "Supabase indexed data write failed");
      return { ok: false, reason: reasonFromError(error) };
    }
  }

  return { ok: false, reason: `Too many missing columns: ${removedColumns.join(", ")}` };
}

export async function upsertIndexedAgent(agent: Record<string, unknown>): Promise<IndexedWriteResult> {
  const stats = agent.stats && typeof agent.stats === "object" ? agent.stats as Record<string, unknown> : {};
  const owner = typeof agent.owner === "string" ? agent.owner.toLowerCase() : null;
  const raw = toSupabaseJson(agent);
  const row: IndexedAgentRow = {
    chain_id: agent.chainId !== undefined ? Number(agent.chainId) : agent.chain_id !== undefined ? Number(agent.chain_id) : 5042002,
    agent_id: String(agent.agentId ?? agent.agent_id ?? ""),
    display_id: formatAgentDisplayId(
      typeof agent.name === "string" ? agent.name : undefined,
      typeof agent.agentId === "string" || typeof agent.agentId === "number" || typeof agent.agentId === "bigint"
        ? agent.agentId
        : typeof agent.agent_id === "string" || typeof agent.agent_id === "number" || typeof agent.agent_id === "bigint"
          ? agent.agent_id
          : undefined
    ),
    owner_wallet: owner,
    owner,
    name: typeof agent.name === "string" ? agent.name : null,
    category: typeof agent.category === "string" ? agent.category : null,
    skills: toSupabaseJson(agent.skills ?? []),
    metadata_uri: typeof agent.metadataURI === "string" ? agent.metadataURI : typeof agent.metadata_uri === "string" ? agent.metadata_uri : null,
    operating_wallet: typeof agent.operatingWallet === "string" ? agent.operatingWallet.toLowerCase() : null,
    reserve_wallet: typeof agent.reserveWallet === "string" ? agent.reserveWallet.toLowerCase() : null,
    active: typeof agent.active === "boolean" ? agent.active : null,
    access_mode: typeof agent.accessMode === "string" ? agent.accessMode : "public",
    trust_bond: agent.trustBond !== undefined ? String(agent.trustBond) : null,
    lifetime_earned: stats.lifetimeEarned !== undefined ? String(stats.lifetimeEarned) : null,
    completed_jobs: stats.completedJobs !== undefined ? String(stats.completedJobs) : null,
    disputed_jobs: stats.disputedJobs !== undefined ? String(stats.disputedJobs) : null,
    avg_score: agent.reputationScore !== undefined ? String(agent.reputationScore) : null,
    reputation_score: agent.reputationScore !== undefined ? String(agent.reputationScore) : null,
    created_at_onchain: agent.createdAt !== undefined ? String(agent.createdAt) : null,
    raw,
    updated_at: new Date().toISOString()
  };
  return safeUpsert("agent:upsert", "indexed_agents", row as unknown as Record<string, unknown>, "agent_id");
}

export async function upsertIndexedJob(job: Record<string, unknown>): Promise<IndexedWriteResult> {
  const payload = toSupabaseJson(job);
  const row: IndexedJobRow = {
    chain_id: job.chainId !== undefined ? Number(job.chainId) : job.chain_id !== undefined ? Number(job.chain_id) : 5042002,
    job_id: String(job.jobId ?? job.job_id ?? ""),
    agent_id: job.agentId !== undefined ? String(job.agentId) : null,
    client: typeof job.client === "string" ? job.client : null,
    status: job.status !== undefined ? String(job.status) : null,
    status_label: typeof job.statusLabel === "string" ? job.statusLabel : null,
    deliverable_uri: typeof job.deliverableURI === "string" ? job.deliverableURI : typeof job.deliverable_uri === "string" ? job.deliverable_uri : null,
    deliverable_hash: typeof job.deliverableHash === "string" ? job.deliverableHash : typeof job.deliverable_hash === "string" ? job.deliverable_hash : null,
    visibility: job.visibility === "public" ? "public" : job.visibility === "restricted" ? "restricted" : null,
    payload,
    updated_at: new Date().toISOString()
  };
  return safeUpsert("job:upsert", "indexed_jobs", row as unknown as Record<string, unknown>, "job_id");
}

export async function linkDeliverableToIndexedJob(input: {
  chainId?: number | null;
  jobId: string | number | bigint;
  agentId?: string | number | bigint | null;
  deliverableURI: string;
  deliverableHash: string;
  visibility?: "public" | "restricted";
  status?: string | number | null;
  statusLabel?: string | null;
  raw?: Record<string, unknown>;
}): Promise<IndexedWriteResult> {
  const row: IndexedJobRow = {
    chain_id: input.chainId ?? 5042002,
    job_id: String(input.jobId),
    agent_id: input.agentId !== undefined && input.agentId !== null ? String(input.agentId) : null,
    status: input.status !== undefined && input.status !== null ? String(input.status) : null,
    status_label: input.statusLabel ?? null,
    deliverable_uri: input.deliverableURI,
    deliverable_hash: input.deliverableHash,
    visibility: input.visibility ?? "restricted",
    payload: toSupabaseJson({
      ...(input.raw ?? {}),
      jobId: String(input.jobId),
      agentId: input.agentId !== undefined && input.agentId !== null ? String(input.agentId) : undefined,
      deliverableURI: input.deliverableURI,
      deliverableHash: input.deliverableHash,
      visibility: input.visibility ?? "restricted"
    }),
    updated_at: new Date().toISOString()
  };
  return safeUpsert("job:deliverableLink", "indexed_jobs", row as unknown as Record<string, unknown>, "job_id");
}

export async function getIndexedJobDeliverable(jobId: string | number | bigint, chainId = 5042002) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("indexed_jobs")
    .select("*")
    .eq("job_id", String(jobId))
    .maybeSingle();
  if (error) {
    logger.warn("supabase.indexedData", "jobDeliverable:readFailed", { error, jobId: String(jobId), chainId }, "Supabase indexed job deliverable read failed");
    return null;
  }
  const row = data as (IndexedJobRow & { payload?: Record<string, unknown> }) | null;
  if (!row) return null;
  const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
  const deliverableURI = row.deliverable_uri || (typeof payload.deliverableURI === "string" ? payload.deliverableURI : null);
  const deliverableHash = row.deliverable_hash || (typeof payload.deliverableHash === "string" ? payload.deliverableHash : null);
  if (!deliverableURI) return null;
  return {
    source: "indexed_jobs" as const,
    deliverableURI,
    deliverableHash,
    visibility: row.visibility === "public" ? "public" as const : "restricted" as const
  };
}

export async function getLatestDeliverableForJob(jobId: string | number | bigint, chainId = 5042002) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("deliverables")
    .select("*")
    .eq("job_id", String(jobId))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.warn("supabase.indexedData", "jobDeliverable:deliverableReadFailed", { error, jobId: String(jobId), chainId }, "Supabase deliverable-by-job read failed");
    return null;
  }
  const row = data as { deliverable_uri?: string; deliverable_hash?: string; visibility?: string } | null;
  if (!row?.deliverable_uri) return null;
  return {
    source: "deliverables" as const,
    deliverableURI: row.deliverable_uri,
    deliverableHash: row.deliverable_hash ?? null,
    visibility: row.visibility === "public" ? "public" as const : "restricted" as const
  };
}

export async function upsertIndexedDispute(dispute: Record<string, unknown>): Promise<IndexedWriteResult> {
  const row: IndexedDisputeRow = {
    dispute_id: String(dispute.disputeId ?? dispute.dispute_id ?? ""),
    job_id: dispute.jobId !== undefined ? String(dispute.jobId) : null,
    opened_by: typeof dispute.openedBy === "string" ? dispute.openedBy : null,
    outcome: dispute.outcome !== undefined ? String(dispute.outcome) : null,
    resolved: typeof dispute.resolved === "boolean" ? dispute.resolved : null,
    payload: toSupabaseJson(dispute),
    updated_at: new Date().toISOString()
  };
  return safeUpsert("dispute:upsert", "indexed_disputes", row as unknown as Record<string, unknown>, "dispute_id");
}

export async function insertAppEvent(event: Pick<AppEventRow, "event_type" | "source" | "payload"> & { event_key?: string | null }): Promise<IndexedWriteResult> {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return { ok: false, reason: "Supabase is not configured." };
  const row: AppEventRow = {
    ...event,
    created_at: new Date().toISOString()
  };
  let legacyFallback = false;
  const result = await safeWrite("event:insert", async () => {
    if (modernAppEventsSchema === null) {
      const { error } = await supabase.from("app_events").select("id,event_type,source,payload,event_key,created_at").limit(1);
      modernAppEventsSchema = !error;
    }

    if (!modernAppEventsSchema) {
      legacyFallback = true;
      return supabase.from("app_events").insert({
        event_type: row.event_type,
        created_at: row.created_at
      });
    }

    if (!row.event_key) {
      return supabase.from("app_events").insert(row);
    }

    const { data, error } = await supabase
      .from("app_events")
      .select("id")
      .eq("event_key", row.event_key)
      .limit(1);
    if (error) return { error };
    const existingId = data?.[0]?.id;
    return existingId
      ? supabase.from("app_events").update(row).eq("id", existingId)
      : supabase.from("app_events").insert(row);
  });
  return result.ok && legacyFallback
    ? { ok: true, reason: "Used legacy app_events insert. Apply lib/supabase/schema.sql for source, payload, and idempotent event_key support." }
    : result;
}

function indexedAgentPayload<T>(row: IndexedAgentRow | null): T | null {
  if (!row) return null;
  if (row.raw && typeof row.raw === "object") return row.raw as T;
  if (row.payload && typeof row.payload === "object") return row.payload as T;
  return {
    agentId: row.agent_id,
    owner: row.owner_wallet ?? row.owner,
    name: row.name,
    category: row.category,
    metadataURI: row.metadata_uri,
    operatingWallet: row.operating_wallet,
    reserveWallet: row.reserve_wallet,
    active: row.active,
    createdAt: row.created_at_onchain,
    trustBond: row.trust_bond,
    reputationScore: row.reputation_score ?? row.avg_score,
    stats: {
      lifetimeEarned: row.lifetime_earned,
      completedJobs: row.completed_jobs,
      disputedJobs: row.disputed_jobs
    }
  } as T;
}

export async function getIndexedAgent<T = unknown>(agentId: string | number | bigint) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("indexed_agents").select("*").eq("agent_id", String(agentId)).maybeSingle();
  if (error) {
    logger.warn("supabase.indexedData", "agent:readFailed", { error, agentId: String(agentId) }, "Supabase indexed agent read failed");
    return null;
  }
  return indexedAgentPayload<T>(data as IndexedAgentRow | null);
}

export async function getIndexedAgents<T = unknown>() {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("indexed_agents").select("*").order("agent_id", { ascending: true });
  if (error) {
    logger.warn("supabase.indexedData", "agents:readFailed", { error }, "Supabase indexed agents read failed");
    return [];
  }
  return (data ?? []).map((row) => indexedAgentPayload<T>(row as IndexedAgentRow)).filter(Boolean) as T[];
}

export async function getIndexedJobs<T = unknown>() {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("indexed_jobs").select("*").order("job_id", { ascending: true });
  if (error) {
    logger.warn("supabase.indexedData", "jobs:readFailed", { error }, "Supabase indexed jobs read failed");
    return [];
  }
  return (data ?? []).map((row) => payloadFromRow<T>(row)).filter(Boolean) as T[];
}

export async function getIndexedJob<T = unknown>(jobId: string | number | bigint) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("indexed_jobs").select("*").eq("job_id", String(jobId)).maybeSingle();
  if (error) {
    logger.warn("supabase.indexedData", "job:readFailed", { error, jobId: String(jobId) }, "Supabase indexed job read failed");
    return null;
  }
  return payloadFromRow<T>(data);
}

export async function getIndexedDisputes<T = unknown>() {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("indexed_disputes").select("*").order("dispute_id", { ascending: true });
  if (error) {
    logger.warn("supabase.indexedData", "disputes:readFailed", { error }, "Supabase indexed disputes read failed");
    return [];
  }
  return (data ?? []).map((row) => payloadFromRow<T>(row)).filter(Boolean) as T[];
}

export async function getIndexedDispute<T = unknown>(disputeId: string | number | bigint) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("indexed_disputes").select("*").eq("dispute_id", String(disputeId)).maybeSingle();
  if (error) {
    logger.warn("supabase.indexedData", "dispute:readFailed", { error, disputeId: String(disputeId) }, "Supabase indexed dispute read failed");
    return null;
  }
  return payloadFromRow<T>(data);
}

export async function getAppEvents() {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("app_events").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) {
    logger.warn("supabase.indexedData", "events:readFailed", { error }, "Supabase app events read failed");
    return [];
  }
  return data ?? [];
}

export async function getDashboardOverview() {
  const [agents, jobs, disputes, events] = await Promise.all([
    getIndexedAgents(),
    getIndexedJobs(),
    getIndexedDisputes(),
    getAppEvents()
  ]);
  return {
    totalAgents: agents.length,
    totalJobs: jobs.length,
    totalDisputes: disputes.length,
    recentEvents: events.slice(0, 10)
  };
}
