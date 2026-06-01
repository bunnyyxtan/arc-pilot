import type { ArcPilotNetwork } from "../sdk/arcpilot";
import { getSdkContracts } from "../sdk/arcpilot";
import { getDispute, getTotalDisputes } from "../sdk/disputes";
import { getJobView } from "../sdk/jobs";
import type { DisputeView } from "../sdk/types";
import {
  getIndexedJobDeliverable,
  insertAppEvent,
  toSupabaseJson,
  upsertIndexedDispute,
  upsertIndexedJob
} from "../supabase/indexed-data";
import { getOptionalServiceRoleSupabaseClient } from "../supabase/server";
import { logger } from "../logger";

type IndexedDisputeSnapshot = {
  available: boolean;
  disputes: Array<Record<string, unknown>>;
  ids: bigint[];
  warning?: string;
};

export type DisputeIndexStatus = {
  liveOnchainDisputes: number;
  indexedDisputes: number;
  missingIndexedDisputes: number;
  lastIndexedDisputeId: string | null;
  missingDisputeIds: string[];
  stale: boolean;
  supabaseAvailable: boolean;
  warning?: string;
};

function toDisputeId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return null;
  try {
    const id = BigInt(value);
    return id > 0n ? id : null;
  } catch {
    return null;
  }
}

function indexedDisputePayload(row: Record<string, unknown>) {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? row.payload as Record<string, unknown>
    : {};
  return {
    ...payload,
    disputeId: payload.disputeId ?? row.dispute_id,
    jobId: payload.jobId ?? row.job_id,
    openedBy: payload.openedBy ?? row.opened_by,
    outcome: payload.outcome ?? row.outcome,
    resolved: payload.resolved ?? row.resolved
  };
}

async function readIndexedDisputeSnapshot(): Promise<IndexedDisputeSnapshot> {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) {
    return {
      available: false,
      disputes: [],
      ids: [],
      warning: "Supabase service-role configuration is unavailable."
    };
  }

  const { data, error } = await supabase
    .from("indexed_disputes")
    .select("*")
    .order("dispute_id", { ascending: true });
  if (error) {
    logger.warn("indexer.disputeSync", "indexedSnapshot:failed", { error }, "Indexed disputes could not be read");
    return {
      available: false,
      disputes: [],
      ids: [],
      warning: `indexed_disputes read failed: ${error.message}`
    };
  }

  const disputes = (data ?? []).map((row) => indexedDisputePayload(row as Record<string, unknown>));
  return {
    available: true,
    disputes,
    ids: disputes.map((dispute) => toDisputeId(dispute.disputeId)).filter((id): id is bigint => id !== null)
  };
}

function statusFromSnapshot(total: bigint, snapshot: IndexedDisputeSnapshot): DisputeIndexStatus {
  const indexed = new Set(snapshot.ids.map((id) => id.toString()));
  const missingDisputeIds: string[] = [];
  for (let id = 1n; id <= total; id += 1n) {
    if (!indexed.has(id.toString())) missingDisputeIds.push(id.toString());
  }
  const lastIndexedDisputeId = snapshot.ids.length > 0
    ? snapshot.ids.reduce((latest, id) => id > latest ? id : latest).toString()
    : null;

  return {
    liveOnchainDisputes: Number(total),
    indexedDisputes: snapshot.ids.length,
    missingIndexedDisputes: missingDisputeIds.length,
    lastIndexedDisputeId,
    missingDisputeIds,
    stale: !snapshot.available || missingDisputeIds.length > 0,
    supabaseAvailable: snapshot.available,
    warning: snapshot.warning
  };
}

function eventPayload(entity: "job" | "dispute", entityId: bigint, payload: Record<string, unknown>) {
  return toSupabaseJson({
    entity,
    entityId: entityId.toString(),
    ...payload
  });
}

async function syncIndexedDispute(dispute: DisputeView, source: string) {
  const disputeWrite = await upsertIndexedDispute(dispute as unknown as Record<string, unknown>);
  const eventWrite = await insertAppEvent({
    event_type: "dispute_state_synced",
    event_key: `dispute_state_synced:${dispute.disputeId.toString()}`,
    source,
    payload: eventPayload("dispute", dispute.disputeId, {
      jobId: dispute.jobId,
      openedBy: dispute.openedBy,
      outcome: dispute.outcome,
      resolved: dispute.resolved
    })
  });
  return {
    ok: disputeWrite.ok,
    warnings: [disputeWrite.reason, eventWrite.reason].filter((reason): reason is string => Boolean(reason))
  };
}

export async function getDisputeIndexStatus(network?: ArcPilotNetwork) {
  const [total, snapshot] = await Promise.all([
    getTotalDisputes(network),
    readIndexedDisputeSnapshot()
  ]);
  return statusFromSnapshot(total, snapshot);
}

export async function readLiveDisputes(network?: ArcPilotNetwork) {
  const total = await getTotalDisputes(network);
  const disputes: DisputeView[] = [];
  for (let id = 1n; id <= total; id += 1n) {
    disputes.push(await getDispute(id, network));
  }
  return disputes;
}

export async function backfillMissingIndexedDisputes(network?: ArcPilotNetwork, source = "api") {
  const before = await getDisputeIndexStatus(network);
  const recoveredDisputeIds: string[] = [];
  const warnings: string[] = [];

  if (!before.supabaseAvailable) {
    return { before, after: before, recoveredDisputeIds, warnings: before.warning ? [before.warning] : [] };
  }

  for (const disputeId of before.missingDisputeIds) {
    const dispute = await getDispute(disputeId, network);
    const result = await syncIndexedDispute(dispute, source);
    warnings.push(...result.warnings);
    if (result.ok) recoveredDisputeIds.push(disputeId);
  }

  const after = await getDisputeIndexStatus(network);
  return { before, after, recoveredDisputeIds, warnings };
}

export async function getDisputeListWithSelfHeal(network?: ArcPilotNetwork) {
  const liveDisputes = await readLiveDisputes(network);
  const repair = await backfillMissingIndexedDisputes(network, "api");
  let snapshot = await readIndexedDisputeSnapshot();

  if (!snapshot.available || repair.after.stale) {
    const warning = snapshot.warning ?? repair.after.warning ?? "indexed_disputes is stale";
    logger.warn("indexer.disputeSync", "list:liveFallback", {
      warning,
      liveDisputes: liveDisputes.length,
      indexedDisputes: snapshot.ids.length,
      missingDisputeIds: repair.after.missingDisputeIds
    }, "Returning live disputes because the Supabase index is unavailable or stale");
    return {
      disputes: liveDisputes as unknown as Array<Record<string, unknown>>,
      source: "onchain" as const,
      warning,
      recoveredDisputeIds: repair.recoveredDisputeIds
    };
  }

  const indexedById = new Map(snapshot.disputes.map((dispute) => [String(dispute.disputeId), dispute]));
  const changedLiveDisputes = liveDisputes.filter((live) => {
    const indexed = indexedById.get(live.disputeId.toString());
    return indexed && (
      Boolean(indexed.resolved) !== live.resolved
      || Number(indexed.outcome || 0) !== live.outcome
    );
  });
  if (changedLiveDisputes.length > 0) {
    await Promise.all(changedLiveDisputes.map((dispute) => syncIndexedDispute(dispute, "api-live-refresh")));
    snapshot = await readIndexedDisputeSnapshot();
  }

  const liveById = new Map(liveDisputes.map((dispute) => [dispute.disputeId.toString(), dispute]));
  const disputes = snapshot.disputes.map((indexed) => {
    const disputeId = toDisputeId(indexed.disputeId);
    const live = disputeId ? liveById.get(disputeId.toString()) : null;
    return live ? { ...indexed, ...live } : indexed;
  });

  return {
    // Supabase supplies indexed metadata, while live onchain state wins for
    // resolution fields so stale cache rows cannot reopen resolved disputes.
    disputes,
    source: "supabase" as const,
    warning: repair.recoveredDisputeIds.length > 0 ? `Recovered missing disputes: ${repair.recoveredDisputeIds.join(", ")}` : undefined,
    recoveredDisputeIds: repair.recoveredDisputeIds
  };
}

async function findDisputeForJob(jobId: bigint, network?: ArcPilotNetwork) {
  const contracts = getSdkContracts(undefined, network);
  const linkedDisputeId = BigInt(await contracts.DisputeManager.jobToDispute(jobId));
  if (linkedDisputeId > 0n) {
    return getDispute(linkedDisputeId, network);
  }

  // The deployed contract exposes jobToDispute. The scan fallback keeps recovery
  // resilient if an older artifact or unusual deployment cannot provide the link.
  const total = await getTotalDisputes(network);
  for (let id = total; id > 0n; id -= 1n) {
    const dispute = await getDispute(id, network);
    if (dispute.jobId === jobId) return dispute;
  }
  throw new Error(`No onchain dispute is linked to job ${jobId.toString()}.`);
}

export async function syncDisputeForJob(input: {
  jobId: bigint;
  txHash?: string | null;
  network?: ArcPilotNetwork;
  source?: string;
}) {
  const source = input.source ?? "api";
  const [job, dispute] = await Promise.all([
    getJobView(input.jobId, input.network),
    findDisputeForJob(input.jobId, input.network)
  ]);
  const savedDeliverable = await getIndexedJobDeliverable(job.jobId);
  const indexedJob = {
    ...job,
    chainId: 5042002,
    deliverableURI: job.deliverableURI || savedDeliverable?.deliverableURI || null,
    deliverableHash: savedDeliverable?.deliverableHash ?? null,
    visibility: savedDeliverable?.visibility ?? null
  };
  const [jobWrite, disputeWrite, jobEvent] = await Promise.all([
    upsertIndexedJob(indexedJob as unknown as Record<string, unknown>),
    syncIndexedDispute(dispute, source),
    insertAppEvent({
      event_type: "job_state_synced",
      event_key: `job_state_synced:${job.jobId.toString()}`,
      source,
      payload: eventPayload("job", job.jobId, {
        agentId: job.agentId,
        client: job.client,
        status: job.status,
        statusLabel: job.statusLabel,
        deliverableURI: indexedJob.deliverableURI
      })
    })
  ]);

  const warnings = [jobWrite.reason, ...disputeWrite.warnings, jobEvent.reason].filter((reason): reason is string => Boolean(reason));
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (supabase && input.txHash && dispute.reasonURI) {
    const { error } = await supabase
      .from("dispute_metadata")
      .update({ tx_hash: input.txHash, updated_at: new Date().toISOString() })
      .eq("reason_uri", dispute.reasonURI);
    if (error) warnings.push(`dispute_metadata tx hash update failed: ${error.message}`);
  }

  if (!jobWrite.ok || !disputeWrite.ok) {
    throw new Error(`Onchain dispute ${dispute.disputeId.toString()} was found, but Supabase indexing failed. ${warnings.join(" ")}`.trim());
  }

  logger.info("indexer.disputeSync", "job:success", {
    jobId: job.jobId,
    disputeId: dispute.disputeId,
    txHash: input.txHash,
    warnings
  }, "Onchain dispute indexed after job rejection");
  return {
    job,
    dispute,
    indexed: true,
    warnings
  };
}
