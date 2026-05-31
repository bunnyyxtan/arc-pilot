import { parseUsdc } from "../../../../../lib/format/usdc";
import { logger } from "../../../../../lib/logger";
import { setSpendingPolicy } from "../../../../../lib/sdk/spending";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  try {
    const { agentId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(agentId, "agentId");
    const policy = {
      maxSpendPerJob: parseUsdc(String(body.maxSpendPerJobUsdc || body.maxSpendPerJob || "0")),
      dailySpendLimit: parseUsdc(String(body.dailySpendLimitUsdc || body.dailySpendLimit || "0")),
      allowData: Boolean(body.allowData),
      allowApi: Boolean(body.allowApi),
      allowCompute: Boolean(body.allowCompute),
      allowOtherAgents: Boolean(body.allowOtherAgents)
    };
    logger.info("api.agents.spending", "setPolicy:received", { agentId: id, policy }, "Spending policy update request received");
    const result = await setSpendingPolicy(
      id,
      policy,
      bodyPrivateKey(body, "DEMO_AGENT_OWNER_PRIVATE_KEY")
    );
    logger.info("api.agents.spending", "setPolicy:success", { agentId: id, txHash: result.txHash }, "Spending policy updated");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.agents.spending", "setPolicy");
  }
}
