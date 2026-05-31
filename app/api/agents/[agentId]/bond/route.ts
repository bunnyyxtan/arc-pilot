import { parseUsdc } from "../../../../../lib/format/usdc";
import { logger } from "../../../../../lib/logger";
import { depositBond } from "../../../../../lib/sdk/treasury";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  try {
    const { agentId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(agentId, "agentId");
    const amount = parseUsdc(String(body.amountUsdc || body.amount || "0"));
    logger.info("api.agents.bond", "deposit:received", { agentId: id, amount }, "Trust bond deposit request received");
    const result = await depositBond(
      id,
      amount,
      bodyPrivateKey(body, "DEMO_AGENT_OWNER_PRIVATE_KEY")
    );
    logger.info("api.agents.bond", "deposit:success", { agentId: id, txHash: result.txHash, approveTxHash: result.approveTxHash }, "Trust bond deposit completed");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.agents.bond", "deposit");
  }
}
