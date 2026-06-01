import { NextResponse } from "next/server";
import { getVerifiedWalletFromRequest } from "../../../../../lib/auth/wallet-session";
import { normalizeWallet } from "../../../../../lib/deliverables/access";
import { logger } from "../../../../../lib/logger";
import { getAgent } from "../../../../../lib/sdk/agents";
import { getJobView } from "../../../../../lib/sdk/jobs";
import { getAgentReviewForJob, getAgentReviews, getAgentReviewSummaries } from "../../../../../lib/reputation/reviews";
import { toSupabaseJson } from "../../../../../lib/supabase/indexed-data";
import { createServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";
import { routeBigInt } from "../../../_utils";

const CHAIN_ID = 5042002;
const ALLOWED_TAGS = new Set(["fast", "accurate", "high quality", "clear communication", "needs improvement"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanTags(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter((item) => ALLOWED_TAGS.has(item)))].slice(0, 5)
    : [];
}

export async function GET(request: Request, context: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await context.params;
    const id = routeBigInt(agentId, "agentId");
    const jobId = new URL(request.url).searchParams.get("jobId");
    const viewer = normalizeWallet(getVerifiedWalletFromRequest(request));
    const [reviews, summaries, reviewForJob] = await Promise.all([
      getAgentReviews(id),
      getAgentReviewSummaries([id]),
      jobId ? getAgentReviewForJob(id, jobId, viewer || undefined) : Promise.resolve(null)
    ]);
    return NextResponse.json({
      ok: true,
      summary: summaries.get(id.toString()),
      reviews,
      reviewForJob
    });
  } catch (error) {
    logger.error("api.agents.reviews", "read:failed", { error }, "Agent reviews read failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load agent reviews." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await context.params;
    const id = routeBigInt(agentId, "agentId");
    const viewer = normalizeWallet(getVerifiedWalletFromRequest(request));
    if (!viewer) return NextResponse.json({ ok: false, error: "Verify the connected client wallet session before submitting a review." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const jobId = routeBigInt(String(body.jobId || ""), "jobId");
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: "Rating must be a whole number from 1 to 5." }, { status: 400 });
    }
    const job = await getJobView(jobId);
    const agent = await getAgent(job.agentId);
    if (job.agentId !== id) return NextResponse.json({ ok: false, error: "This job does not belong to the selected agent." }, { status: 400 });
    if (![4, 6].includes(job.status)) return NextResponse.json({ ok: false, error: "Reviews can be submitted only after approval or after a dispute is opened." }, { status: 409 });
    if (normalizeWallet(String(job.client)) !== viewer) return NextResponse.json({ ok: false, error: "Only the job client can review this agent." }, { status: 403 });
    if (normalizeWallet(String(agent.owner)) === viewer) return NextResponse.json({ ok: false, error: "Self-use jobs do not count toward public agent ratings." }, { status: 409 });
    const reviewContext = job.status === 6 ? "dispute" : "approval";
    const insertRow = {
      chain_id: CHAIN_ID,
      agent_id: id.toString(),
      job_id: jobId.toString(),
      client_wallet: viewer,
      rating,
      review_text: cleanText(body.reviewText, 2000) || null,
      tags: cleanTags(body.tags),
      review_context: reviewContext,
      raw: toSupabaseJson({ source: "client_job_review", reviewContext }),
      updated_at: new Date().toISOString()
    };
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("agent_reviews")
      .upsert(insertRow, { onConflict: "chain_id,job_id,client_wallet" })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Agent review could not be saved.");
    logger.info("api.agents.reviews", "upsert:success", { agentId: id, jobId, rating, reviewContext }, "Agent review saved");
    return NextResponse.json({ ok: true, review: data });
  } catch (error) {
    logger.error("api.agents.reviews", "create:failed", { error }, "Agent review save failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save agent review." }, { status: 500 });
  }
}
