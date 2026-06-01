import { NextResponse } from "next/server";
import { getJobRegenerationSummary } from "../../../../../lib/jobs/regenerations";
import { logger } from "../../../../../lib/logger";
import { routeBigInt } from "../../../_utils";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const id = routeBigInt(jobId, "jobId");
    return NextResponse.json({ ok: true, regeneration: await getJobRegenerationSummary(id) });
  } catch (error) {
    logger.warn("api.jobs.regenerations", "read:failed", { error }, "Job regeneration policy read failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to read regeneration policy." }, { status: 500 });
  }
}
