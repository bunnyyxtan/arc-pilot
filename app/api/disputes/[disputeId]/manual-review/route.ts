import { NextResponse } from "next/server";
import { getVerifiedWalletFromRequest } from "../../../../../lib/auth/wallet-session";
import { normalizeWallet } from "../../../../../lib/deliverables/access";
import { isResolverAdminWallet } from "../../../../../lib/disputes/resolver";
import { getAgent } from "../../../../../lib/sdk/agents";
import { getDispute } from "../../../../../lib/sdk/disputes";
import { getJobView } from "../../../../../lib/sdk/jobs";
import { createServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ disputeId: string }>;
};

function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Manual review request failed.";
  console.error("[manual-review]", { status, error: message });
  return NextResponse.json({ ok: false, error: message }, { status });
}

function parseDisputeId(raw: string) {
  if (!/^\d+$/.test(raw)) {
    throw new Error("Invalid dispute id.");
  }

  return BigInt(raw);
}

async function assertParticipant(disputeId: bigint, wallet: string) {
  const dispute = await getDispute(disputeId);
  const job = await getJobView(dispute.jobId);
  const agent = await getAgent(job.agentId);
  const viewer = normalizeWallet(wallet);

  if (
    viewer !== normalizeWallet(job.client) &&
    viewer !== normalizeWallet(job.evaluator) &&
    viewer !== normalizeWallet(agent.owner)
  ) {
    throw new Error("Only the client, evaluator, or agent owner can request manual review.");
  }

  return { dispute, job };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { disputeId: rawDisputeId } = await context.params;
    const disputeId = parseDisputeId(rawDisputeId);
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("manual_review_requests")
      .select("*")
      .eq("dispute_id", disputeId.toString())
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Could not load manual review queue: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      request: data?.[0] ?? null,
      requests: data ?? [],
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { disputeId: rawDisputeId } = await context.params;
    const disputeId = parseDisputeId(rawDisputeId);
    const verifiedWallet = getVerifiedWalletFromRequest(request);

    if (!verifiedWallet) {
      return fail(new Error("Verify your connected wallet session before requesting manual review."), 401);
    }

    const body = (await request.json()) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 20 || reason.length > 2_000) {
      return fail(new Error("Appeal reason must be between 20 and 2000 characters."), 400);
    }

    const { job } = await assertParticipant(disputeId, verifiedWallet);

    const supabase = createServiceRoleSupabaseClient();
    const requester = normalizeWallet(verifiedWallet);
    const { data: existing, error: existingError } = await supabase
      .from("manual_review_requests")
      .select("*")
      .eq("dispute_id", disputeId.toString())
      .eq("requested_by_wallet", requester)
      .in("status", ["open", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Could not inspect manual review queue: ${existingError.message}`);
    }

    if (existing) {
      return NextResponse.json({ ok: true, request: existing, reused: true });
    }

    const { data, error } = await supabase
      .from("manual_review_requests")
      .insert({
        chain_id: 5042002,
        dispute_id: disputeId.toString(),
        job_id: job.jobId.toString(),
        requested_by_wallet: requester,
        reason,
        status: "open",
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Could not add appeal to the resolver queue: ${error.message}`);
    }

    return NextResponse.json({ ok: true, request: data });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { disputeId: rawDisputeId } = await context.params;
    const disputeId = parseDisputeId(rawDisputeId);
    const verifiedWallet = getVerifiedWalletFromRequest(request);

    if (!isResolverAdminWallet(verifiedWallet)) {
      return fail(new Error("Only the ArcPilot resolver/admin wallet can update the manual review queue."), 403);
    }

    const body = (await request.json()) as {
      requestId?: unknown;
      status?: unknown;
      resolverNote?: unknown;
    };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    const resolverNote = typeof body.resolverNote === "string" ? body.resolverNote.trim() : "";

    if (!requestId) {
      return fail(new Error("Manual review request id is required."), 400);
    }
    if (!["accepted", "resolved", "rejected"].includes(status)) {
      return fail(new Error("Manual review status must be accepted, resolved, or rejected."), 400);
    }
    if (resolverNote.length > 2_000) {
      return fail(new Error("Resolver note cannot exceed 2000 characters."), 400);
    }

    const resolvedAt = status === "resolved" || status === "rejected" ? new Date().toISOString() : null;
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("manual_review_requests")
      .update({
        status,
        reviewed_by_wallet: normalizeWallet(verifiedWallet),
        resolver_note: resolverNote || null,
        resolved_at: resolvedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("dispute_id", disputeId.toString())
      .select("*")
      .single();

    if (error) {
      throw new Error(`Could not update resolver queue item: ${error.message}`);
    }

    return NextResponse.json({ ok: true, request: data });
  } catch (error) {
    return fail(error);
  }
}
