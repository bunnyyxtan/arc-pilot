import { buildAgentListFromEvents } from "../../../lib/indexer/agents";
import { buildJobListFromEvents } from "../../../lib/indexer/jobs";
import { logger } from "../../../lib/logger";
import { registerAgent } from "../../../lib/sdk/agents";
import { getIndexedAgents, getIndexedJobs, upsertIndexedAgent } from "../../../lib/supabase/indexed-data";
import { withPublicMarketplaceAgentList } from "../../../lib/reputation/public-stats";
import { fail, ok, readJson, bodyPrivateKey } from "../_utils";
import { withAgentReviewSummaries } from "../../../lib/reputation/reviews";

export async function GET() {
  logger.info("api.agents", "list:received", {}, "Agent list request received");
  try {
    const indexedAgents = await getIndexedAgents();
    if (indexedAgents.length > 0) {
      const indexedJobs = await getIndexedJobs();
      const jobs = indexedJobs.length > 0 ? indexedJobs : await buildJobListFromEvents();
      logger.info("api.agents", "list:supabaseSuccess", { count: indexedAgents.length }, "Agent list loaded from Supabase");
      return ok({ agents: await withAgentReviewSummaries(withPublicMarketplaceAgentList(indexedAgents as Record<string, unknown>[], jobs as Record<string, unknown>[])), source: "supabase" });
    }

    const agents = await buildAgentListFromEvents();
    const jobs = await buildJobListFromEvents();
    await Promise.all(agents.map((agent) => upsertIndexedAgent(agent as unknown as Record<string, unknown>)));
    logger.info("api.agents", "list:success", { count: agents.length, source: "indexer" }, "Agent list request completed");
    return ok({ agents: await withAgentReviewSummaries(withPublicMarketplaceAgentList(agents, jobs)), source: "indexer" });
  } catch (error) {
    return fail(error, 500, "api.agents", "list");
  }
}

export async function POST(request: Request) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  logger.info("api.agents", "register:received", {}, "Agent registration request received");
  try {
    const body = await readJson(request);
    logger.debug("api.agents", "register:input", {
      name: body.name,
      category: body.category,
      operatingWallet: body.operatingWallet,
      reserveWallet: body.reserveWallet
    }, "Agent registration input validated for logging");
    const privateKey = bodyPrivateKey(body, "DEMO_AGENT_OWNER_PRIVATE_KEY");
    const result = await registerAgent(
      {
        name: String(body.name || ""),
        category: String(body.category || ""),
        metadataURI: String(body.metadataURI || ""),
        skills: String(body.skills || ""),
        operatingWallet: body.operatingWallet as `0x${string}`,
        reserveWallet: body.reserveWallet as `0x${string}`
      },
      privateKey
    );
    logger.info("api.agents", "register:success", { txHash: result.txHash }, "Agent registration completed");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.agents", "register");
  }
}
