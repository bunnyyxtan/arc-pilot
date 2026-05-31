import { buildDisputeListFromEvents } from "../lib/indexer/disputes";
import { bigintJson } from "../lib/sdk/types";

const disputes = await buildDisputeListFromEvents();
if (disputes.length === 0) {
  console.log("No events found. Run npm run arc:smoke or npm run arc:demo first.");
} else {
  console.log(JSON.stringify(bigintJson({ disputes }), null, 2));
}
