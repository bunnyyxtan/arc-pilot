import { NextResponse } from "next/server";
import { getVerifiedWalletFromRequest } from "../../../../../lib/auth/wallet-session";
import { normalizeWallet } from "../../../../../lib/deliverables/access";
import { toBigIntSafe } from "../../../../../lib/format/ids";
import { logger } from "../../../../../lib/logger";
import { getAgent } from "../../../../../lib/sdk/agents";
import { getDispute } from "../../../../../lib/sdk/disputes";
import { getJobView } from "../../../../../lib/sdk/jobs";
import { toSupabaseJson } from "../../../../../lib/supabase/indexed-data";
import { createServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";

const CHAIN_ID = 5042002;

function safeId(value: bigint) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value.toString();
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeSupabaseMessage(error: { code?: string; message?: string } | null) {
  if (!error) return "Unknown Supabase error.";
  if (error.code === "PGRST205" || error.message?.includes("schema cache")) {
    return "Evidence storage is not configured. Apply lib/supabase/schema.sql in Supabase.";
  }
  return error.message || "Supabase could not save dispute evidence.";
}

async function participantContext(disputeId: bigint, viewer: string | null) {
  const dispute = await getDispute(disputeId);
  const job = await getJobView(dispute.jobId);
  const agent = await getAgent(job.agentId);
  const participants = [dispute.openedBy, job.client, job.evaluator, agent.owner].map((wallet) => normalizeWallet(String(wallet)));
  return { dispute, job, isParticipant: Boolean(viewer && participants.includes(viewer)) };
}

export async function GET(_request: Request, context: { params: Promise<{ disputeId: string }> }) {
  try {
    const { disputeId } = await context.params;
    const id = toBigIntSafe(disputeId);
    if (!id) return NextResponse.json({ ok: false, error: "disputeId must be a positive numeric identifier." }, { status: 400 });
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("dispute_evidence")
      .select("*")
      .eq("dispute_id", id.toString())
      .order("created_at", { ascending: true });
    if (error) throw new Error(safeSupabaseMessage(error));
    return NextResponse.json({ ok: true, evidence: data ?? [] });
  } catch (error) {
    logger.warn("api.disputes.evidence", "read:failed", { error }, "Dispute evidence read failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load dispute evidence." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  try {
    const { disputeId } = await context.params;
    const id = toBigIntSafe(disputeId);
    if (!id) return NextResponse.json({ ok: false, error: "disputeId must be a positive numeric identifier." }, { status: 400 });
    const viewer = normalizeWallet(getVerifiedWalletFromRequest(request));
    if (!viewer) return NextResponse.json({ ok: false, error: "Verify your connected wallet session before submitting evidence." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const evidenceText = cleanText(body.evidenceText, 5000);
    const supportingLink = cleanText(body.supportingLink, 1000);
    if (evidenceText.length < 20) {
      return NextResponse.json({ ok: false, error: "Evidence explanation must contain at least 20 characters." }, { status: 400 });
    }
    const { dispute, job, isParticipant } = await participantContext(id, viewer);
    if (!isParticipant) return NextResponse.json({ ok: false, error: "Only a dispute participant can submit evidence." }, { status: 403 });
    if (dispute.resolved) return NextResponse.json({ ok: false, error: "This dispute is already resolved." }, { status: 409 });
    const evidenceURI = `arcpilot://evidence/dispute-${id.toString()}-${Date.now()}`;
    const insertRow = {
      chain_id: CHAIN_ID,
      dispute_id: safeId(dispute.disputeId),
      job_id: safeId(job.jobId),
      submitted_by_wallet: viewer,
      evidence_text: evidenceText,
      supporting_link: supportingLink || null,
      evidence_uri: evidenceURI,
      raw: toSupabaseJson({ evidenceText, supportingLink: supportingLink || null })
    };
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase.from("dispute_evidence").insert(insertRow).select("*").single();
    if (error || !data) throw new Error(safeSupabaseMessage(error));
    logger.info("api.disputes.evidence", "create:success", { disputeId: id, evidenceURI, submittedByWallet: viewer }, "Dispute evidence metadata saved");
    return NextResponse.json({ ok: true, evidenceURI, evidence: data });
  } catch (error) {
    logger.error("api.disputes.evidence", "create:failed", { error }, "Dispute evidence metadata save failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save dispute evidence." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  try {
    const { disputeId } = await context.params;
    const id = toBigIntSafe(disputeId);
    if (!id) return NextResponse.json({ ok: false, error: "disputeId must be a positive numeric identifier." }, { status: 400 });
    const viewer = normalizeWallet(getVerifiedWalletFromRequest(request));
    if (!viewer) return NextResponse.json({ ok: false, error: "Verify your connected wallet session before updating evidence." }, { status: 401 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const evidenceURI = cleanText(body.evidenceURI, 500);
    const txHash = cleanText(body.txHash, 100);
    if (!evidenceURI.startsWith(`arcpilot://evidence/dispute-${id.toString()}-`) || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json({ ok: false, error: "A valid evidence URI and Arc Testnet transaction hash are required." }, { status: 400 });
    }
    const { isParticipant } = await participantContext(id, viewer);
    if (!isParticipant) return NextResponse.json({ ok: false, error: "Only a dispute participant can update evidence." }, { status: 403 });
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("dispute_evidence")
      .update({ tx_hash: txHash, updated_at: new Date().toISOString() })
      .eq("evidence_uri", evidenceURI)
      .eq("submitted_by_wallet", viewer)
      .select("*")
      .single();
    if (error || !data) throw new Error(safeSupabaseMessage(error));
    return NextResponse.json({ ok: true, evidence: data });
  } catch (error) {
    logger.error("api.disputes.evidence", "update:failed", { error }, "Dispute evidence transaction link failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to link evidence transaction." }, { status: 500 });
  }
}
