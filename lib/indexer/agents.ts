import { getAgentView } from "../sdk/agents";
import type { ArcPilotNetwork } from "../sdk/arcpilot";
import { logger, loggedOperation } from "../logger";
import { getIndexerContracts, readEvents } from "./events";

export async function getAgentEvents(network?: ArcPilotNetwork) {
  return loggedOperation("indexer.agents", "getAgentEvents", { network }, async () => {
    const contracts = getIndexerContracts(network);
    const [registryEvents, bondEvents, spendingEvents] = await Promise.all([
      readEvents(contracts.AgentRegistry, "AgentRegistry", ["AgentRegistered", "AgentDeactivated"]),
      readEvents(contracts.TrustBondVault, "TrustBondVault", ["BondDeposited"]),
      readEvents(contracts.SpendingPolicyManager, "SpendingPolicyManager", ["SpendingPolicyUpdated", "ExpenseLogged"])
    ]);
    return [...registryEvents, ...bondEvents, ...spendingEvents].sort(
      (a, b) => a.blockNumber - b.blockNumber || a.transactionHash.localeCompare(b.transactionHash)
    );
  });
}

export async function buildAgentListFromEvents(network?: ArcPilotNetwork) {
  const events = await getAgentEvents(network);
  const ids = new Set<bigint>();

  for (const event of events) {
    const agentId = event.args.agentId;
    if (typeof agentId === "bigint") {
      ids.add(agentId);
    }
  }

  logger.info("indexer.agents", "buildAgentList:idsCollected", { agentCount: ids.size, eventCount: events.length, network }, "Collected agent IDs from events");
  return Promise.all([...ids].sort((a, b) => Number(a - b)).map((agentId) => getAgentView(agentId, network)));
}
