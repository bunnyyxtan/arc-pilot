import { NextResponse } from "next/server";
import { logger } from "../../../../lib/logger";
import { getOptionalServiceRoleSupabaseClient } from "../../../../lib/supabase/server";
import type { DisputeMetadataRow, Json } from "../../../../lib/supabase/types";

const ARC_TESTNET_CHAIN_ID = 5042002;

class InvalidDisputeMetadataError extends Error {}

function normalizeNumericId(value: unknown, field: string, required = true): number | string | null {
  if ((value === undefined || value === null || value === "") && !required) return null;
  const raw = typeof value === "number" || typeof value === "bigint" || typeof value === "string"
    ? String(value).trim()
    : "";
  if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
    throw new InvalidDisputeMetadataError(`${field} must be a positive numeric identifier.`);
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : raw;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeWallet(value: unknown) {
  const wallet = normalizeOptionalText(value);
  return wallet ? wallet.toLowerCase() : null;
}

function safeSupabaseError(error: unknown) {
  const candidate = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof candidate.code === "string" ? candidate.code : "unknown";
  const message = typeof candidate.message === "string" ? candidate.message : "Unknown Supabase error.";

  if (code === "PGRST205" || /dispute_metadata.*schema cache|relation .*dispute_metadata.*does not exist/i.test(message)) {
    return { error: "Dispute metadata storage is not configured.", details: "table dispute_metadata missing" };
  }
  if (code === "PGRST204" || /column|schema cache/i.test(message)) {
    return { error: "Dispute metadata schema is out of date.", details: `column mismatch: ${message}` };
  }
  if (code === "42501" || /row-level security|permission denied|rls/i.test(message)) {
    return { error: "Dispute metadata write was rejected by Supabase permissions.", details: "service role or RLS configuration issue" };
  }
  if (code === "23505") {
    return { error: "A dispute metadata record already exists for this reason URI.", details: "duplicate reason_uri" };
  }
  return { error: "Supabase could not save dispute metadata.", details: `${code}: ${message}` };
}

export async function POST(request: Request) {
  logger.info("api.disputeMetadata", "create:received", {}, "Dispute metadata create request received");
  try {
    const data = await request.json() as Record<string, unknown>;
    const jobId = normalizeNumericId(data.jobId, "jobId");
    const agentId = normalizeNumericId(data.agentId, "agentId", false);
    if (jobId === null) {
      throw new InvalidDisputeMetadataError("jobId is required.");
    }
    const reason = normalizeOptionalText(data.reason);
    if (!reason || reason.length < 20 || reason.length > 2000) {
      throw new InvalidDisputeMetadataError("reason must contain between 20 and 2000 characters.");
    }

    const timestamp = Date.now();
    const reasonURI = normalizeOptionalText(data.reasonURI) ?? `arcpilot://dispute/job-${String(jobId)}-${timestamp}`;
    const insertData: DisputeMetadataRow = {
      chain_id: ARC_TESTNET_CHAIN_ID,
      job_id: jobId,
      agent_id: agentId,
      client_wallet: normalizeWallet(data.clientWallet),
      evaluator_wallet: normalizeWallet(data.evaluatorWallet),
      category: normalizeOptionalText(data.category),
      reason,
      deliverable_uri: normalizeOptionalText(data.deliverableURI),
      reason_uri: reasonURI,
      raw: {
        jobId: String(jobId),
        agentId: agentId === null ? null : String(agentId),
        clientWallet: normalizeWallet(data.clientWallet),
        evaluatorWallet: normalizeWallet(data.evaluatorWallet),
        category: normalizeOptionalText(data.category),
        reason,
        deliverableURI: normalizeOptionalText(data.deliverableURI),
        chainId: ARC_TESTNET_CHAIN_ID
      } as Json
    };

    const supabase = getOptionalServiceRoleSupabaseClient();
    if (!supabase) {
      logger.warn("api.disputeMetadata", "create:supabaseMissing", { jobId: String(jobId) }, "Supabase service role client is unavailable");
      return NextResponse.json({
        ok: false,
        error: "Supabase server configuration is missing.",
        details: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      }, { status: 500 });
    }

    const { data: metadata, error } = await supabase
      .from("dispute_metadata")
      .insert(insertData)
      .select("*")
      .single();
    if (error || !metadata) {
      const safe = safeSupabaseError(error);
      logger.warn("api.disputeMetadata", "create:supabaseFailed", {
        jobId: String(jobId),
        code: error?.code,
        message: error?.message
      }, "Supabase dispute metadata save failed");
      return NextResponse.json({ ok: false, ...safe }, { status: 500 });
    }

    logger.info("api.disputeMetadata", "create:success", {
      jobId: String(jobId),
      metadataId: metadata.id,
      reasonURI
    }, "Dispute metadata saved");
    return NextResponse.json({
      ok: true,
      reasonURI,
      metadataId: metadata.id,
      metadata
    });
  } catch (error) {
    if (error instanceof InvalidDisputeMetadataError) {
      logger.warn("api.disputeMetadata", "create:invalidPayload", { message: error.message }, "Invalid dispute metadata payload");
      return NextResponse.json({ ok: false, error: "Invalid dispute metadata payload.", details: error.message }, { status: 400 });
    }
    logger.error("api.disputeMetadata", "create:failed", { error }, "Dispute metadata create request failed");
    return NextResponse.json({ ok: false, error: "Dispute metadata request failed.", details: "Invalid JSON or unexpected server error." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reasonURI = searchParams.get("reasonUri") || "";
    if (!reasonURI) {
      return NextResponse.json({ ok: false, error: "Missing reasonUri." }, { status: 400 });
    }

    const supabase = getOptionalServiceRoleSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Supabase server configuration is missing." }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("dispute_metadata")
      .select("*")
      .eq("reason_uri", reasonURI)
      .maybeSingle();
    if (error) {
      const safe = safeSupabaseError(error);
      logger.warn("api.disputeMetadata", "read:supabaseFailed", { code: error.code, message: error.message }, "Supabase dispute metadata read failed");
      return NextResponse.json({ ok: false, ...safe }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Dispute metadata not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, metadata: data });
  } catch (error) {
    logger.error("api.disputeMetadata", "read:failed", { error }, "Dispute metadata read request failed");
    return NextResponse.json({ ok: false, error: "Dispute metadata request failed." }, { status: 500 });
  }
}
