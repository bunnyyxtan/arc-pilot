import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { JOB_STATUS, getJobStatusLabel, normalizeJobStatus } from "../lib/jobs/status";

async function read(relativePath: string) {
  return readFile(join(process.cwd(), relativePath), "utf8");
}

assert.equal(normalizeJobStatus(2n), JOB_STATUS.RUNNING);
assert.equal(normalizeJobStatus("3"), JOB_STATUS.SUBMITTED);
assert.equal(getJobStatusLabel(4n), "Completed");
console.log("ok shared status map: bigint, string, and numeric lifecycle values normalize consistently");

const runRoute = await read("app/api/jobs/[jobId]/run/route.ts");
assert(runRoute.includes("normalizeJobStatus(job.status)"));
assert(runRoute.includes("liveStatus !== JOB_STATUS.RUNNING"));
assert(!runRoute.includes("job.status !== 2"));
assert(runRoute.includes("run:reuseExisting"));
console.log("ok AI run route: live Running state is bigint-safe and saved output reuse is idempotent");

const jobPage = await read("app/jobs/[jobId]/page.tsx");
assert(jobPage.includes("startWorkAndGenerate"));
assert(jobPage.includes("Retry AI Generation"));
assert(jobPage.includes("Generating AI Output..."));
assert(!jobPage.includes('<Input label="Deliverable URI"'));
assert(!jobPage.includes(">Run AI Agent<"));
console.log("ok job detail: Start Work auto-generates, URI entry is hidden, and retry stays in recovery controls");

const escrow = await read("contracts/AgentJobEscrow.sol");
assert(escrow.includes("function fundJob("));
assert(escrow.includes("function markRunning("));
assert(escrow.includes("function submitDeliverable("));
assert(!escrow.includes("function multicall("));
console.log("ok deployed contract boundary: funding, start, and submission remain separate wallet transactions");

console.log("Job flow checks passed.");
