import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDisputeStatus } from "../lib/disputes/status";
import { assertRegenerationAvailable, regenerationSummary } from "../lib/jobs/regenerations";
import { evidenceWasSubmitted } from "../lib/disputes/review-guard";

async function read(relativePath: string) {
  return readFile(join(process.cwd(), relativePath), "utf8");
}

async function main() {
  assert.equal(getDisputeStatus({ resolved: true }, { hasEvidence: true, hasAIReview: true }), "Resolved onchain");
  assert.equal(getDisputeStatus({ resolved: false }, { hasEvidence: true, hasAIReview: true }), "AI review ready");
  assert.equal(getDisputeStatus({ resolved: false }, { hasEvidence: true }), "Evidence submitted");
  assert.equal(getDisputeStatus({ resolved: false }), "Awaiting resolution");
  console.log("ok dispute status priority: live resolution overrides cached workflow state");

  const previousLimit = process.env.ARC_MAX_REGENERATIONS_PER_JOB;
  process.env.ARC_MAX_REGENERATIONS_PER_JOB = "1";
  assert.equal(regenerationSummary(0).remainingAttempts, 1);
  assert.doesNotThrow(() => assertRegenerationAvailable(regenerationSummary(0)));
  assert.throws(() => assertRegenerationAvailable(regenerationSummary(1)), /Regeneration limit reached/);
  if (previousLimit === undefined) delete process.env.ARC_MAX_REGENERATIONS_PER_JOB;
  else process.env.ARC_MAX_REGENERATIONS_PER_JOB = previousLimit;
  console.log("ok regeneration policy: one server-tracked retry is allowed by default");

  assert.equal(evidenceWasSubmitted(0), false);
  assert.equal(evidenceWasSubmitted(1), true);
  console.log("ok evidence wording source: zero rows cannot be treated as considered evidence");

  const reviewRoute = await read("app/api/agents/[agentId]/reviews/route.ts");
  assert(reviewRoute.includes('.upsert(insertRow, { onConflict: "chain_id,job_id,client_wallet" })'));
  assert(reviewRoute.includes('const reviewContext = job.status === 6 ? "dispute" : "approval"'));
  console.log("ok client review API: verified approval/dispute feedback uses one-row upsert");

  const jobPage = await read("app/jobs/[jobId]/page.tsx");
  const deliverablePage = await read("app/deliverables/[hash]/page.tsx");
  assert(!jobPage.includes("deliverableSource"));
  assert(!deliverablePage.includes('response?.source === "supabase"'));
  assert(!deliverablePage.includes("Draft / Pre-submit"));
  console.log("ok deliverable UI: storage and draft implementation tags are hidden");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
