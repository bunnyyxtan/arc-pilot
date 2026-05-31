import { NextResponse } from "next/server";
import { logger } from "../../../../lib/logger";
import { getOptionalServiceRoleSupabaseClient } from "../../../../lib/supabase/server";
import type { AgentMetadataRow, Json } from "../../../../lib/supabase/types";

const CHAIN_ID = 5042002;
const NETWORK = "Arc Testnet";

function normalizeWallet(value: unknown) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : "";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "agent";
}

function parseSkills(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  }
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function buildMetadataURI(name: string, ownerWallet: string, createdAt: string) {
  const shortWallet = ownerWallet ? ownerWallet.slice(0, 6) : "0x0000";
  const timestamp = Math.floor(new Date(createdAt).getTime() / 1000);
  return `arcpilot://agent/${slugify(name)}-${shortWallet}-${timestamp}`;
}

function buildMetadata(body: Record<string, unknown>, createdAt: string, ownerWallet: string, skills: string[]) {
  return {
    name: String(body.name || "").trim(),
    category: String(body.category || "").trim(),
    skills,
    ownerWallet,
    operatingWallet: normalizeWallet(body.operatingWallet),
    reserveWallet: normalizeWallet(body.reserveWallet),
    chainId: CHAIN_ID,
    network: NETWORK,
    source: "ArcPilot",
    createdAt
  };
}

export async function POST(request: Request) {
  logger.info("api.agentMetadata", "create:received", {}, "Agent metadata create request received");
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim();
    const ownerWallet = normalizeWallet(body.ownerWallet);
    const operatingWallet = normalizeWallet(body.operatingWallet);
    const reserveWallet = normalizeWallet(body.reserveWallet);
    const skills = parseSkills(body.skills);
    if (!name || !category || !ownerWallet || !operatingWallet || !reserveWallet) {
      return NextResponse.json({ ok: false, error: "Missing required metadata fields." }, { status: 400 });
    }

    const createdAt = new Date().toISOString();
    const metadataURI = buildMetadataURI(name, ownerWallet, createdAt);
    const metadata = buildMetadata(body, createdAt, ownerWallet, skills);
    let saved = false;

    const supabase = getOptionalServiceRoleSupabaseClient();
    if (supabase) {
      const row: AgentMetadataRow = {
        chain_id: CHAIN_ID,
        owner_wallet: ownerWallet,
        agent_name: name,
        category,
        skills,
        operating_wallet: operatingWallet,
        reserve_wallet: reserveWallet,
        metadata: metadata as unknown as Json,
        metadata_uri: metadataURI,
        created_at: createdAt,
        updated_at: createdAt
      };
      const { error } = await supabase.from("agent_metadata").upsert(row, { onConflict: "metadata_uri" });
      if (error) {
        logger.warn("api.agentMetadata", "create:supabaseFailed", { error, metadataURI }, "Supabase agent metadata save failed; returning generated URI");
      } else {
        saved = true;
      }
    }

    logger.info("api.agentMetadata", "create:success", { metadataURI, saved }, "Agent metadata URI generated");
    return NextResponse.json({ ok: true, metadataURI, metadata, saved });
  } catch (error) {
    logger.error("api.agentMetadata", "create:failed", { error }, "Agent metadata create request failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Metadata generation failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const metadataURI = url.searchParams.get("uri") || "";
  logger.info("api.agentMetadata", "read:received", { metadataURI }, "Agent metadata read request received");
  if (!metadataURI.startsWith("arcpilot://agent/")) {
    return NextResponse.json({ ok: false, error: "Unsupported metadata URI." }, { status: 400 });
  }

  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Metadata record not found. Onchain URI is still available." }, { status: 404 });
  }

  const { data, error } = await supabase.from("agent_metadata").select("*").eq("metadata_uri", metadataURI).maybeSingle();
  if (error) {
    logger.warn("api.agentMetadata", "read:supabaseFailed", { error, metadataURI }, "Supabase agent metadata read failed");
    return NextResponse.json({ ok: false, error: "Metadata record not found. Onchain URI is still available." }, { status: 404 });
  }
  if (!data) {
    logger.info("api.agentMetadata", "read:notFound", { metadataURI }, "Agent metadata record was not found");
    return NextResponse.json({ ok: false, error: "Metadata record not found. Onchain URI is still available." }, { status: 404 });
  }

  logger.info("api.agentMetadata", "read:success", { metadataURI }, "Agent metadata read request completed");
  return NextResponse.json({ ok: true, metadata: data.metadata, row: data });
}
