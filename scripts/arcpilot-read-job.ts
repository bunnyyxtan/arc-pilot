import { getJobView } from "../lib/sdk/jobs";
import { bigintJson } from "../lib/sdk/types";

const jobId = process.env.JOB_ID;
if (!jobId) {
  throw new Error("JOB_ID is required.");
}

console.log(JSON.stringify(bigintJson({ job: await getJobView(BigInt(jobId)) }), null, 2));
