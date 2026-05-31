import type { ArcPilotNetwork } from "../sdk/arcpilot";
import { getJobView } from "../sdk/jobs";
import { logger, loggedOperation } from "../logger";
import { getIndexerContracts, readEvents } from "./events";

export async function getJobEvents(network?: ArcPilotNetwork) {
  return loggedOperation("indexer.jobs", "getJobEvents", { network }, async () => {
    const contracts = getIndexerContracts(network);
    return readEvents(contracts.AgentJobEscrow, "AgentJobEscrow", [
      "JobCreated",
      "JobFunded",
      "JobRunning",
      "DeliverableSubmitted",
      "JobCompleted",
      "JobMovedToDispute"
    ]);
  });
}

export async function buildJobListFromEvents(network?: ArcPilotNetwork) {
  const events = await getJobEvents(network);
  const ids = new Set<bigint>();

  for (const event of events) {
    const jobId = event.args.jobId;
    if (typeof jobId === "bigint") {
      ids.add(jobId);
    }
  }

  logger.info("indexer.jobs", "buildJobList:idsCollected", { jobCount: ids.size, eventCount: events.length, network }, "Collected job IDs from events");
  return Promise.all([...ids].sort((a, b) => Number(a - b)).map((jobId) => getJobView(jobId, network)));
}
