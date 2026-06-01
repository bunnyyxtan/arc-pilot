import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256Stable } from "../format/hash";
import { logger } from "../logger";
import { getOptionalServiceRoleSupabaseClient } from "../supabase/server";
import { linkDeliverableToIndexedJob } from "../supabase/indexed-data";
import type { DeliverableRow } from "../supabase/types";
import type { DeliverableType } from "./prompts";
import { sanitizeDeliverableFields } from "./sanitize";

export type DeliverableRecord = {
  hash: `0x${string}`;
  deliverableURI?: string;
  chainId?: number | null;
  jobId?: string | null;
  agentId?: string | null;
  agentName: string;
  agentCategory: string;
  jobTitle: string;
  jobDescription: string;
  deliverableType: DeliverableType;
  generatedTitle: string;
  generatedContent: string;
  qualityChecklist: string[];
  createdByWallet?: string | null;
  txHash?: string | null;
  visibility?: "public" | "restricted";
  clientWallet?: string | null;
  agentOwnerWallet?: string | null;
  evaluatorWallet?: string | null;
  raw?: unknown;
  createdAt: string;
};

export type DeliverableSource = "supabase" | "local";

export type DeliverableReadResult = {
  source: DeliverableSource;
  deliverable: DeliverableRecord;
};

export const DELIVERABLES_DIR = resolve("data/deliverables");

function allowLocalDeliverableFallback() {
  return process.env.NODE_ENV !== "production";
}

export function deliverableURI(hash: `0x${string}`) {
  return `local-deliverable://${hash}`;
}

function toSupabaseRow(record: DeliverableRecord): DeliverableRow {
  const uri = record.deliverableURI || deliverableURI(record.hash);
  return {
    deliverable_hash: record.hash,
    deliverable_uri: uri,
    chain_id: record.chainId ?? null,
    job_id: record.jobId ?? null,
    agent_id: record.agentId ?? null,
    agent_name: record.agentName,
    agent_category: record.agentCategory,
    job_title: record.jobTitle,
    job_description: record.jobDescription,
    deliverable_type: record.deliverableType,
    generated_title: record.generatedTitle,
    generated_content: record.generatedContent,
    quality_checklist: record.qualityChecklist,
    created_by_wallet: record.createdByWallet ?? null,
    tx_hash: record.txHash ?? null,
    visibility: record.visibility ?? "restricted",
    client_wallet: record.clientWallet?.toLowerCase() ?? null,
    agent_owner_wallet: record.agentOwnerWallet?.toLowerCase() ?? null,
    evaluator_wallet: record.evaluatorWallet?.toLowerCase() ?? null,
    raw: record.raw ? JSON.parse(JSON.stringify(record.raw)) : JSON.parse(JSON.stringify(record)),
    created_at: record.createdAt
  };
}

function fromSupabaseRow(row: DeliverableRow): DeliverableRecord {
  return {
    hash: row.deliverable_hash as `0x${string}`,
    deliverableURI: row.deliverable_uri,
    chainId: row.chain_id,
    jobId: row.job_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    agentCategory: row.agent_category,
    jobTitle: row.job_title,
    jobDescription: row.job_description,
    deliverableType: row.deliverable_type,
    generatedTitle: row.generated_title,
    generatedContent: row.generated_content,
    qualityChecklist: row.quality_checklist,
    createdByWallet: row.created_by_wallet,
    txHash: row.tx_hash,
    visibility: row.visibility === "public" ? "public" : "restricted",
    clientWallet: row.client_wallet,
    agentOwnerWallet: row.agent_owner_wallet,
    evaluatorWallet: row.evaluator_wallet,
    raw: row.raw,
    createdAt: row.created_at
  };
}

async function saveLocalDeliverable(record: DeliverableRecord) {
  await mkdir(DELIVERABLES_DIR, { recursive: true });
  await writeFile(resolve(DELIVERABLES_DIR, `${record.hash}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export function hashFromDeliverableURI(uri: string) {
  if (!uri.startsWith("local-deliverable://")) return null;
  const hash = uri.slice("local-deliverable://".length).trim();
  return /^0x[a-fA-F0-9]{64}$/.test(hash) ? hash : null;
}

export async function saveDeliverable(input: Omit<DeliverableRecord, "hash" | "createdAt" | "deliverableURI">) {
  const sanitized = sanitizeDeliverableFields({
    generatedTitle: input.generatedTitle,
    generatedContent: input.generatedContent,
    qualityChecklist: input.qualityChecklist
  });
  logger.info("openai.deliverable", "save:start", {
    agentName: input.agentName,
    deliverableType: input.deliverableType,
    jobTitle: input.jobTitle,
    generatedTitleLength: sanitized.generatedTitle.length,
    generatedContentLength: sanitized.generatedContent.length
  }, "Saving generated deliverable");
  const payload = {
    ...input,
    visibility: input.visibility === "public" ? "public" as const : "restricted" as const,
    clientWallet: input.clientWallet?.toLowerCase() ?? null,
    agentOwnerWallet: input.agentOwnerWallet?.toLowerCase() ?? null,
    evaluatorWallet: input.evaluatorWallet?.toLowerCase() ?? null,
    generatedTitle: sanitized.generatedTitle || input.jobTitle || "ArcPilot Deliverable",
    generatedContent: sanitized.generatedContent,
    qualityChecklist: sanitized.qualityChecklist.length > 0 ? sanitized.qualityChecklist : ["Meets requested job scope", "Ready for client review", "Saved with deliverable hash"],
    createdAt: new Date().toISOString()
  };
  const hash = keccak256Stable(payload);
  const record: DeliverableRecord = {
    hash,
    deliverableURI: deliverableURI(hash),
    ...payload
  };

  let supabaseSaved = false;
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase && !allowLocalDeliverableFallback()) {
    throw new Error("Supabase deliverable storage is required in production. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (supabase) {
    const { error } = await supabase.from("deliverables").upsert(toSupabaseRow(record), { onConflict: "deliverable_hash" });
    if (error) {
      if (!allowLocalDeliverableFallback()) {
        throw new Error(`Supabase deliverable save failed in production: ${error.message}`);
      }
      logger.warn("openai.deliverable", "save:supabaseFailed", { deliverableHash: hash, error }, "Supabase deliverable save failed; falling back to local JSON");
    } else {
      supabaseSaved = true;
    }
  }

  if (allowLocalDeliverableFallback()) {
    try {
      await saveLocalDeliverable(record);
    } catch (error) {
      logger.warn("openai.deliverable", "save:localFailed", { deliverableHash: hash, error }, "Local deliverable backup save failed");
      if (!supabaseSaved) {
        throw error;
      }
    }
  }

  if (record.jobId) {
    await linkDeliverableToIndexedJob({
      chainId: record.chainId ?? 5042002,
      jobId: record.jobId,
      agentId: record.agentId ?? null,
      deliverableURI: record.deliverableURI || deliverableURI(hash),
      deliverableHash: hash,
      visibility: record.visibility ?? "restricted",
      statusLabel: "Running",
      raw: {
        jobTitle: record.jobTitle,
        agentName: record.agentName
      }
    });
  }

  logger.info("openai.deliverable", "save:success", {
    deliverableHash: hash,
    deliverableURI: deliverableURI(hash),
    directory: DELIVERABLES_DIR,
    supabaseSaved
  }, "Deliverable saved");

  return {
    record,
    deliverableHash: hash,
    deliverableURI: deliverableURI(hash)
  };
}

export async function readDeliverableWithSource(hash: string): Promise<DeliverableReadResult | null> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    logger.warn("openai.deliverable", "read:invalidHash", { hash }, "Deliverable hash format is invalid");
    return null;
  }

  const filepath = resolve(DELIVERABLES_DIR, `${hash}.json`);
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase && !allowLocalDeliverableFallback()) {
    throw new Error("Supabase deliverable storage is required in production. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (supabase) {
    const { data, error } = await supabase
      .from("deliverables")
      .select("*")
      .eq("deliverable_hash", hash)
      .maybeSingle();

    if (error) {
      if (!allowLocalDeliverableFallback()) {
        throw new Error(`Supabase deliverable read failed in production: ${error.message}`);
      }
      logger.warn("openai.deliverable", "read:supabaseFailed", { hash, error }, "Supabase deliverable read failed; falling back to local JSON");
    } else if (data) {
      logger.info("openai.deliverable", "read:supabaseSuccess", { hash }, "Deliverable loaded from Supabase");
      return { source: "supabase", deliverable: fromSupabaseRow(data) };
    }
  }

  if (!allowLocalDeliverableFallback() || !existsSync(filepath)) {
    logger.info("openai.deliverable", "read:notFound", { hash }, "Deliverable file was not found");
    return null;
  }

  logger.info("openai.deliverable", "read:localSuccess", { hash }, "Deliverable file loaded from local fallback");
  return { source: "local", deliverable: JSON.parse(await readFile(filepath, "utf8")) as DeliverableRecord };
}

export async function readDeliverable(hash: string) {
  const result = await readDeliverableWithSource(hash);
  return result?.deliverable ?? null;
}

export async function findLocalDeliverableForJob(jobId: string | number | bigint) {
  if (!allowLocalDeliverableFallback()) return null;
  const id = String(jobId);
  if (!existsSync(DELIVERABLES_DIR)) return null;
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(DELIVERABLES_DIR);
  const matches: DeliverableRecord[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const record = JSON.parse(await readFile(resolve(DELIVERABLES_DIR, file), "utf8")) as DeliverableRecord;
      if (String(record.jobId ?? "") === id) matches.push(record);
    } catch {
      // Ignore malformed local fallback files.
    }
  }
  matches.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const latest = matches[0];
  if (!latest) return null;
  return {
    source: "local" as const,
    deliverableURI: latest.deliverableURI || deliverableURI(latest.hash),
    deliverableHash: latest.hash,
    visibility: latest.visibility ?? ("restricted" as const)
  };
}

export async function backfillLocalDeliverablesToSupabase() {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) {
    return { found: 0, saved: 0, warnings: ["Supabase is not configured."] };
  }
  if (!existsSync(DELIVERABLES_DIR)) {
    return { found: 0, saved: 0, warnings: [] as string[] };
  }

  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(DELIVERABLES_DIR)).filter((file) => file.endsWith(".json"));
  const warnings: string[] = [];
  let saved = 0;
  for (const file of files) {
    try {
      const record = JSON.parse(await readFile(resolve(DELIVERABLES_DIR, file), "utf8")) as DeliverableRecord;
      if (!/^0x[a-fA-F0-9]{64}$/.test(record.hash)) {
        warnings.push(`${file}: invalid deliverable hash`);
        continue;
      }
      const { error } = await supabase.from("deliverables").upsert(toSupabaseRow(record), { onConflict: "deliverable_hash" });
      if (error) {
        warnings.push(`${record.hash}: ${error.message}`);
        continue;
      }
      saved += 1;
      if (record.jobId) {
        const link = await linkDeliverableToIndexedJob({
          chainId: record.chainId ?? 5042002,
          jobId: record.jobId,
          agentId: record.agentId ?? null,
          deliverableURI: record.deliverableURI || deliverableURI(record.hash),
          deliverableHash: record.hash,
          visibility: record.visibility ?? "restricted",
          raw: { source: "local-backfill" }
        });
        if (!link.ok || link.reason) warnings.push(`${record.hash}: indexed job link ${link.reason || "failed"}`);
      }
    } catch (error) {
      warnings.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  logger.info("openai.deliverable", "backfill:complete", { found: files.length, saved, warnings: warnings.length }, "Local deliverable Supabase backfill completed");
  return { found: files.length, saved, warnings };
}
