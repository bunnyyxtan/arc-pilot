import { NextResponse } from "next/server";
import { getVerifiedWalletFromRequest } from "../../../../../lib/auth/wallet-session";
import { loadAgentScopeProfile } from "../../../../../lib/agents/profile";
import { validateAgentScope } from "../../../../../lib/agents/scope-validator";
import { normalizeWallet } from "../../../../../lib/deliverables/access";
import { logger } from "../../../../../lib/logger";
import { getAgent } from "../../../../../lib/sdk/agents";
import { toSupabaseJson } from "../../../../../lib/supabase/indexed-data";
import { createServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";
import { routeBigInt } from "../../../_utils";

const CHAIN_ID = 5042002;

function clean(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await context.params;
    const id = routeBigInt(agentId, "agentId");
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const jobTitle = clean(body.jobTitle, 300);
    const jobDescription = clean(body.jobDescription);
    const jobType = clean(body.jobType, 80) || "general";
    if (!jobTitle || !jobDescription) {
      return NextResponse.json({ ok: false, error: "Job title and description are required for scope validation." }, { status: 400 });
    }

    const agent = await getAgent(id);
    const profile = await loadAgentScopeProfile(agent);
    const decision = validateAgentScope({
      agentName: agent.name,
      agentCategory: profile.category || agent.category,
      skills: profile.skills,
      metadata: profile.metadata,
      jobTitle,
      jobDescription,
      jobType
    });
    const verifiedWallet = normalizeWallet(getVerifiedWalletFromRequest(request));
    const requestedClientWallet = normalizeWallet(clean(body.clientWallet, 100));
    const clientWallet = verifiedWallet || requestedClientWallet || null;
    const agentOwner = normalizeWallet(String(agent.owner));
    const selfUseAllowed = body.jobMode === "self_use" && Boolean(clientWallet && agentOwner && clientWallet === agentOwner);
    const overrideAccepted = body.overrideAccepted === true && decision.suggestedAction === "warn";
    const insertRow = {
      chain_id: CHAIN_ID,
      agent_id: id.toString(),
      client_wallet: clientWallet,
      job_title: jobTitle,
      job_description: jobDescription,
      agent_category: profile.category || String(agent.category || ""),
      agent_skills: profile.skills,
      in_scope: decision.inScope,
      scope_confidence: decision.confidence,
      scope_reason: decision.reason,
      matched_skills: decision.matchedSkills,
      missing_capabilities: decision.missingCapabilities,
      decision: overrideAccepted ? "override_accepted" : decision.suggestedAction,
      raw: toSupabaseJson({ jobType, jobMode: body.jobMode, selfUseAllowed, overrideAccepted, metadataURI: agent.metadataURI })
    };
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase.from("job_scope_checks").insert(insertRow).select("id").single();
    if (error || !data?.id) {
      throw new Error(`Scope-check storage is not configured. Apply lib/supabase/schema.sql in Supabase. ${error?.message || ""}`.trim());
    }
    logger.info("api.agents.scopeCheck", "create:success", {
      agentId: id,
      scopeCheckId: data.id,
      decision: decision.suggestedAction,
      selfUseAllowed,
      overrideAccepted
    }, "Agent scope check saved");
    return NextResponse.json({ ok: true, scopeCheckId: data.id, agentOwner, selfUseAllowed, overrideAccepted, decision });
  } catch (error) {
    logger.error("api.agents.scopeCheck", "create:failed", { error }, "Agent scope check failed");
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Agent scope check failed." }, { status: 500 });
  }
}
