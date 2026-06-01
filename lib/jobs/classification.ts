export type JobClassification = "marketplace" | "self_use";

export type JobClassificationInput = {
  storedClassification?: unknown;
  explicitClassification?: unknown;
  metadataClassification?: unknown;
  jobClassification?: unknown;
  jobMode?: unknown;
  clientWallet?: unknown;
  client?: unknown;
  agentOwnerWallet?: unknown;
  agentOwner?: unknown;
  owner?: unknown;
};

function normalizeWallet(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeJobClassification(value: unknown): JobClassification | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["marketplace", "marketplace_job", "market", "public", "public_marketplace", "third_party"].includes(normalized)) {
    return "marketplace";
  }
  if (["self_use", "self_use_job", "selfuse", "self", "test", "test_run", "internal"].includes(normalized)) {
    return "self_use";
  }
  return null;
}

export function resolveJobClassification(input: JobClassificationInput): JobClassification {
  const explicit =
    normalizeJobClassification(input.storedClassification) ??
    normalizeJobClassification(input.explicitClassification);
  if (explicit) return explicit;

  const metadata =
    normalizeJobClassification(input.metadataClassification) ??
    normalizeJobClassification(input.jobClassification) ??
    normalizeJobClassification(input.jobMode);
  if (metadata) return metadata;

  const client = normalizeWallet(input.clientWallet ?? input.client);
  const owner = normalizeWallet(input.agentOwnerWallet ?? input.agentOwner ?? input.owner);
  if (client && owner && client === owner) return "self_use";

  return "marketplace";
}

export function isMarketplaceJob(job: JobClassificationInput) {
  return resolveJobClassification(job) === "marketplace";
}

export function isSelfUseJob(job: JobClassificationInput) {
  return resolveJobClassification(job) === "self_use";
}

export function shouldCountTowardPublicRatings(job: JobClassificationInput) {
  return isMarketplaceJob(job);
}
