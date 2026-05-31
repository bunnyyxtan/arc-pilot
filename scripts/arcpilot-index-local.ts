import { buildAgentListFromEvents } from "../lib/indexer/agents";
import { buildDisputeListFromEvents } from "../lib/indexer/disputes";
import { buildJobListFromEvents } from "../lib/indexer/jobs";
import { bigintJson } from "../lib/sdk/types";

const [agents, jobs, disputes] = await Promise.all([
  buildAgentListFromEvents(),
  buildJobListFromEvents(),
  buildDisputeListFromEvents()
]);

if (agents.length === 0 && jobs.length === 0 && disputes.length === 0) {
  console.log("No events found. Run npm run arc:smoke or npm run arc:demo first.");
} else {
  console.log(JSON.stringify(bigintJson({ agents, jobs, disputes }), null, 2));
}
