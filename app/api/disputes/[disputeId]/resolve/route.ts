import { parseUsdc } from "../../../../../lib/format/usdc";
import { logger } from "../../../../../lib/logger";
import { getVerifiedWalletFromRequest } from "../../../../../lib/auth/wallet-session";
import { isResolverAdminWallet } from "../../../../../lib/auth/resolver";
import { resolveAgentWins, resolveClientWins, resolveSplit } from "../../../../../lib/sdk/disputes";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";
import { createServiceRoleSupabaseClient } from "../../../../../lib/supabase/server";

async function loadGuardedReview(disputeId: bigint) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("ai_dispute_reviews")
    .select("guarded_recommendation,recommended_outcome,slash_amount,agent_bps,client_bps")
    .eq("dispute_id", disputeId.toString())
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load guarded dispute recommendation: ${error.message}`);
  if (!data) throw new Error("Run the AI dispute review before executing a resolution.");
  return data;
}

export async function POST(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  logger.info("api.disputes.resolve", "resolve:received", {}, "Dispute resolve request received");
  try {
    if (!isResolverAdminWallet(getVerifiedWalletFromRequest(request))) {
      return fail(
        new Error("Only resolver/admin wallet can execute dispute resolution."),
        403,
        "api.disputes.resolve",
        "resolve"
      );
    }

    const { disputeId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(disputeId, "disputeId");
    const privateKey = bodyPrivateKey(body);
    const outcome = String(body.outcome || "");
    const guardedReview = await loadGuardedReview(id);
    const advancedOverride = process.env.ARC_ENABLE_RESOLVER_ADVANCED_OVERRIDE === "true";
    logger.info("api.disputes.resolve", "resolve:start", { disputeId: id, outcome }, "Resolving dispute");

    if (outcome === "agentWins" || outcome === "agent_wins") {
      const result = await resolveAgentWins(id, privateKey);
      logger.info("api.disputes.resolve", "resolve:success", { disputeId: id, outcome, txHash: result.txHash }, "Dispute resolved");
      return ok({ result });
    }
    if (outcome === "clientWins" || outcome === "client_wins") {
      const slashAmount = advancedOverride ? body.slashAmountUsdc || body.slashAmount || "0" : guardedReview.slash_amount || "0";
      const result = await resolveClientWins(id, parseUsdc(String(slashAmount)), privateKey);
      logger.info("api.disputes.resolve", "resolve:success", { disputeId: id, outcome, txHash: result.txHash }, "Dispute resolved");
      return ok({ result });
    }
    if (outcome === "split") {
      const guardedAgentBps = Number(guardedReview.agent_bps || 0);
      const guardedClientBps = Number(guardedReview.client_bps || 0);
      const useGuardedSplit = guardedAgentBps + guardedClientBps === 10000;
      const agentBps = BigInt(String(advancedOverride ? body.agentBps : useGuardedSplit ? guardedAgentBps : 5000));
      const clientBps = BigInt(String(advancedOverride ? body.clientBps : useGuardedSplit ? guardedClientBps : 5000));
      if (agentBps + clientBps !== 10000n) {
        throw new Error("agentBps + clientBps must equal 10000.");
      }
      const result = await resolveSplit(id, agentBps, clientBps, privateKey);
      logger.info("api.disputes.resolve", "resolve:success", { disputeId: id, outcome, txHash: result.txHash }, "Dispute resolved");
      return ok({ result });
    }

    logger.warn("api.disputes.resolve", "resolve:invalidOutcome", { disputeId: id, outcome }, "Invalid dispute outcome");
    throw new Error("outcome must be agent_wins, client_wins, or split.");
  } catch (error) {
    return fail(error, 400, "api.disputes.resolve", "resolve");
  }
}
