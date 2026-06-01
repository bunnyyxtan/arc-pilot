import { getAgentView } from "../../../../lib/sdk/agents";
import { buildJobListFromEvents } from "../../../../lib/indexer/jobs";
import { logger } from "../../../../lib/logger";
import { fail, ok, routeBigInt } from "../../_utils";
import { getIndexedAgent, getIndexedJobs } from "../../../../lib/supabase/indexed-data";
import { withPublicMarketplaceStats } from "../../../../lib/reputation/public-stats";

export async function GET(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await context.params;
    const id = routeBigInt(agentId, "agentId");
    logger.info("api.agents", "read:received", { agentId: id }, "Agent read request received");
    const indexedAgent = await getIndexedAgent<Record<string, unknown>>(id);
    let agent: Record<string, unknown>;
    let source = "indexed_agents";
    if (indexedAgent) {
      agent = indexedAgent;
    } else {
      agent = await getAgentView(id) as unknown as Record<string, unknown>;
      source = "onchain";
    }
    const indexedJobs = await getIndexedJobs();
    const jobs = indexedJobs.length > 0 ? indexedJobs : await buildJobListFromEvents();
    logger.info("api.agents", "read:success", { agentId: id }, "Agent read request completed");
    return ok({ agent: withPublicMarketplaceStats(agent, jobs as Record<string, unknown>[]), source });
  } catch (error) {
    return fail(error, 500, "api.agents", "read");
  }
}
