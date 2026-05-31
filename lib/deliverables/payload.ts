import type { DeliverableAccess } from "./access";
import { buildDeliverablePreview } from "../format/deliverable";
import { deliverableURI, type DeliverableRecord } from "../openai/deliverable";

function normalizeId(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
    return Number(value);
  }
  return value ?? null;
}

export function getDeliverableVisibility(deliverable: DeliverableRecord) {
  return deliverable.visibility === "public"
    ? "public" as const
    : "restricted" as const;
}

export function toApiDeliverable(deliverable: DeliverableRecord, access: DeliverableAccess) {
  const visibility = getDeliverableVisibility(deliverable);
  const preview = buildDeliverablePreview(deliverable.generatedContent);
  const base = {
    deliverable_hash: deliverable.hash,
    deliverable_uri: deliverable.deliverableURI || deliverableURI(deliverable.hash),
    chain_id: deliverable.chainId ?? null,
    job_id: normalizeId(deliverable.jobId),
    agent_id: normalizeId(deliverable.agentId),
    agent_name: deliverable.agentName,
    agent_category: deliverable.agentCategory,
    job_title: deliverable.jobTitle,
    deliverable_type: deliverable.deliverableType,
    visibility,
    created_at: deliverable.createdAt
  };
  if (access === "locked") return base;
  const review = {
    ...base,
    generated_title: deliverable.generatedTitle,
    executive_summary: preview.executiveSummary,
    key_findings: preview.keyFindings,
    recommendations: preview.recommendations,
    quality_checklist: deliverable.qualityChecklist
  };
  if (access === "preview") return review;
  return {
    ...review,
    job_description: deliverable.jobDescription,
    generated_content: deliverable.generatedContent,
    created_by_wallet: deliverable.createdByWallet ?? null,
    tx_hash: deliverable.txHash ?? null
  };
}
