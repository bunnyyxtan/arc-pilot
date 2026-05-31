import { buildJobListFromEvents } from "../lib/indexer/jobs";
import { bigintJson } from "../lib/sdk/types";

const jobs = await buildJobListFromEvents();
if (jobs.length === 0) {
  console.log("No events found. Run npm run arc:smoke or npm run arc:demo first.");
} else {
  console.log(JSON.stringify(bigintJson({ jobs }), null, 2));
}
