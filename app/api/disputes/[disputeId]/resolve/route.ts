import { parseUsdc } from "../../../../../lib/format/usdc";
import { logger } from "../../../../../lib/logger";
import { resolveAgentWins, resolveClientWins, resolveSplit } from "../../../../../lib/sdk/disputes";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  logger.info("api.disputes.resolve", "resolve:received", {}, "Dispute resolve request received");
  try {
    const { disputeId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(disputeId, "disputeId");
    const privateKey = bodyPrivateKey(body);
    const outcome = String(body.outcome || "");
    logger.info("api.disputes.resolve", "resolve:start", { disputeId: id, outcome }, "Resolving dispute");

    if (outcome === "agentWins") {
      const result = await resolveAgentWins(id, privateKey);
      logger.info("api.disputes.resolve", "resolve:success", { disputeId: id, outcome, txHash: result.txHash }, "Dispute resolved");
      return ok({ result });
    }
    if (outcome === "clientWins") {
      const result = await resolveClientWins(id, parseUsdc(String(body.slashAmountUsdc || body.slashAmount || "0")), privateKey);
      logger.info("api.disputes.resolve", "resolve:success", { disputeId: id, outcome, txHash: result.txHash }, "Dispute resolved");
      return ok({ result });
    }
    if (outcome === "split") {
      const result = await resolveSplit(id, BigInt(String(body.agentBps)), BigInt(String(body.clientBps)), privateKey);
      logger.info("api.disputes.resolve", "resolve:success", { disputeId: id, outcome, txHash: result.txHash }, "Dispute resolved");
      return ok({ result });
    }

    logger.warn("api.disputes.resolve", "resolve:invalidOutcome", { disputeId: id, outcome }, "Invalid dispute outcome");
    throw new Error("outcome must be agentWins, clientWins, or split.");
  } catch (error) {
    return fail(error, 400, "api.disputes.resolve", "resolve");
  }
}
