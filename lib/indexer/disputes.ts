import type { ArcPilotNetwork } from "../sdk/arcpilot";
import { getDispute } from "../sdk/disputes";
import { logger, loggedOperation } from "../logger";
import { getIndexerContracts, readEvents } from "./events";

export async function getDisputeEvents(network?: ArcPilotNetwork) {
  return loggedOperation("indexer.disputes", "getDisputeEvents", { network }, async () => {
    const contracts = getIndexerContracts(network);
    return readEvents(contracts.DisputeManager, "DisputeManager", ["DisputeOpened", "DisputeResolved"]);
  });
}

export async function buildDisputeListFromEvents(network?: ArcPilotNetwork) {
  const events = await getDisputeEvents(network);
  const ids = new Set<bigint>();

  for (const event of events) {
    const disputeId = event.args.disputeId;
    if (typeof disputeId === "bigint") {
      ids.add(disputeId);
    }
  }

  logger.info("indexer.disputes", "buildDisputeList:idsCollected", { disputeCount: ids.size, eventCount: events.length, network }, "Collected dispute IDs from events");
  return Promise.all([...ids].sort((a, b) => Number(a - b)).map((disputeId) => getDispute(disputeId, network)));
}
