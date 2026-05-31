import { logger } from "../../../../../lib/logger";
import { setTreasuryPolicy } from "../../../../../lib/sdk/treasury";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  try {
    const { agentId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(agentId, "agentId");
    const operatingBps = BigInt(String(body.operatingBps));
    const reserveBps = BigInt(String(body.reserveBps));
    const bondBps = BigInt(String(body.bondBps));
    logger.info("api.agents.treasury", "setPolicy:received", { agentId: id, operatingBps, reserveBps, bondBps }, "Treasury policy update request received");
    const result = await setTreasuryPolicy(
      id,
      operatingBps,
      reserveBps,
      bondBps,
      bodyPrivateKey(body, "DEMO_AGENT_OWNER_PRIVATE_KEY")
    );
    logger.info("api.agents.treasury", "setPolicy:success", { agentId: id, txHash: result.txHash }, "Treasury policy updated");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.agents.treasury", "setPolicy");
  }
}
