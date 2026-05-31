import { NextResponse } from "next/server";
import { logger } from "../../../../../lib/logger";
import { getAgent } from "../../../../../lib/sdk/agents";
import { getDispute } from "../../../../../lib/sdk/disputes";
import { getJobView } from "../../../../../lib/sdk/jobs";
import { createServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";

const CHAIN_ID = 5042002;

function normalizeWallet(value: unknown) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value.trim()) ? value.trim().toLowerCase() : null;
}

function safeId(value: bigint) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value.toString();
}

export async function GET(_request: Request, context: { params: Promise<{ disputeId: string }> }) {
  try {
    const { disputeId } = await context.params;
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("manual_review_requests")
      .select("*")
      .eq("dispute_id", disputeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, request: data ?? null });
  } catch (error) {
    logger.warn("api.disputes.manualReview", "read:failed", { error }, "Manual review request read failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load manual review request." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  const { disputeId } = await context.params;
  logger.info("api.disputes.manualReview", "create:received", { disputeId }, "Manual review request received");
  try {
    const body = await request.json() as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const requestedByWallet = normalizeWallet(body.requestedByWallet);
    if (reason.length < 20 || reason.length > 2000) {
      return NextResponse.json({ ok: false, error: "Manual review reason must contain between 20 and 2000 characters." }, { status: 400 });
    }
    if (!requestedByWallet) {
      return NextResponse.json({ ok: false, error: "Connect a valid participant wallet before requesting manual review." }, { status: 400 });
    }

    const dispute = await getDispute(disputeId);
    const job = await getJobView(dispute.jobId);
    const agent = await getAgent(job.agentId);
    const participants = [dispute.openedBy, job.client, job.evaluator, agent.owner].map((wallet) => String(wallet).toLowerCase());
    if (!participants.includes(requestedByWallet)) {
      return NextResponse.json({ ok: false, error: "Only a dispute participant can request manual review." }, { status: 403 });
    }
    const supabase = createServiceRoleSupabaseClient();
    const insertRow = {
      chain_id: CHAIN_ID,
      dispute_id: safeId(dispute.disputeId),
      job_id: safeId(dispute.jobId),
      requested_by_wallet: requestedByWallet,
      reason,
      status: "open"
    };
    const { data, error } = await supabase.from("manual_review_requests").insert(insertRow).select("*").single();
    if (error || !data) throw new Error(error?.message || "Supabase could not save the manual review request.");
    logger.info("api.disputes.manualReview", "create:success", { disputeId, requestId: data.id }, "Manual review request saved");
    return NextResponse.json({ ok: true, request: data });
  } catch (error) {
    logger.error("api.disputes.manualReview", "create:failed", { disputeId, error }, "Manual review request failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Manual review request failed." }, { status: 500 });
  }
}
