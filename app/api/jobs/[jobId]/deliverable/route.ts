import { NextResponse } from "next/server";
import { getJob } from "../../../../../lib/sdk/jobs";
import { hashFromDeliverableURI, findLocalDeliverableForJob } from "../../../../../lib/openai/deliverable";
import { getIndexedJobDeliverable, getLatestDeliverableForJob } from "../../../../../lib/supabase/indexed-data";
import { logger } from "../../../../../lib/logger";

function response(payload: {
  source?: "onchain" | "indexed_jobs" | "deliverables" | "local";
  deliverableURI: string | null;
  deliverableHash?: string | null;
  visibility?: "public" | "restricted";
}) {
  return NextResponse.json({
    ok: true,
    source: payload.source ?? null,
    deliverable_uri: payload.deliverableURI,
    deliverable_hash: payload.deliverableHash ?? (payload.deliverableURI ? hashFromDeliverableURI(payload.deliverableURI) : null),
    visibility: payload.visibility ?? "restricted"
  });
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  logger.info("api.jobs.deliverable", "read:received", { jobId }, "Job deliverable lookup received");
  try {
    const job = await getJob(jobId);
    if (typeof job.deliverableURI === "string" && job.deliverableURI) {
      return response({
        source: "onchain",
        deliverableURI: job.deliverableURI,
        deliverableHash: hashFromDeliverableURI(job.deliverableURI),
        visibility: "restricted"
      });
    }
  } catch (error) {
    logger.warn("api.jobs.deliverable", "read:onchainFailed", { jobId, error }, "Onchain job deliverable lookup failed");
  }

  const indexed = await getIndexedJobDeliverable(jobId);
  if (indexed?.deliverableURI) {
    return response({
      source: indexed.source,
      deliverableURI: indexed.deliverableURI,
      deliverableHash: indexed.deliverableHash,
      visibility: indexed.visibility
    });
  }

  const saved = await getLatestDeliverableForJob(jobId);
  if (saved?.deliverableURI) {
    return response({
      source: saved.source,
      deliverableURI: saved.deliverableURI,
      deliverableHash: saved.deliverableHash,
      visibility: saved.visibility
    });
  }

  const local = await findLocalDeliverableForJob(jobId);
  if (local?.deliverableURI) {
    return response({
      source: local.source,
      deliverableURI: local.deliverableURI,
      deliverableHash: local.deliverableHash,
      visibility: local.visibility
    });
  }

  return response({ deliverableURI: null });
}
