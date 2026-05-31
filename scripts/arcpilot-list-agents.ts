import { buildAgentListFromEvents } from "../lib/indexer/agents";
import { bigintJson } from "../lib/sdk/types";

const agents = await buildAgentListFromEvents();
if (agents.length === 0) {
  console.log("No events found. Run npm run arc:smoke or npm run arc:demo first.");
} else {
  console.log(JSON.stringify(bigintJson({ agents }), null, 2));
}
