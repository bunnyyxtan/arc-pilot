import { strict as assert } from "node:assert";
import { createWalletSessionToken, verifyWalletSessionToken } from "../lib/auth/wallet-session";
import { getDeliverableAccess, type DeliverableAccessInput } from "../lib/deliverables/access";
import { toApiDeliverable } from "../lib/deliverables/payload";
import type { DeliverableRecord } from "../lib/openai/deliverable";
import { withPublicMarketplaceStats } from "../lib/reputation/public-stats";

const owner = "0x1111111111111111111111111111111111111111";
const client = "0x2222222222222222222222222222222222222222";
const evaluator = "0x3333333333333333333333333333333333333333";
const random = "0x4444444444444444444444444444444444444444";
const reportSentinel = "FULL REPORT SENTINEL MUST NEVER LEAK";
const testSecret = "arcpilot-test-wallet-session-secret-32-chars";

function check(label: string, input: Omit<DeliverableAccessInput, "visibility"> & { visibility?: DeliverableAccessInput["visibility"] }, expected: { access: string; mode: string }) {
  const result = getDeliverableAccess({ agentOwner: owner, clientWallet: client, evaluatorWallet: evaluator, visibility: "restricted", ...input });
  assert.equal(result.access, expected.access, `${label}: access`);
  assert.equal(result.mode, expected.mode, `${label}: mode`);
  console.log(`ok ${label}: ${result.access}/${result.mode}`);
}

check("running draft without signed session", { jobStatus: 2, isSubmittedOnchain: false }, { access: "locked", mode: "draft" });
check("running draft spoofed owner query ignored", { jobStatus: 2, isSubmittedOnchain: false }, { access: "locked", mode: "draft" });
check("running draft verified owner sealed", { jobStatus: 2, isSubmittedOnchain: false, viewerWallet: owner }, { access: "preview", mode: "draft" });
check("running draft client", { jobStatus: 2, isSubmittedOnchain: false, viewerWallet: client }, { access: "locked", mode: "draft" });
check("submitted client", { jobStatus: 3, isSubmittedOnchain: true, viewerWallet: client }, { access: "preview", mode: "preview" });
check("submitted owner sealed", { jobStatus: 3, isSubmittedOnchain: true, viewerWallet: owner }, { access: "preview", mode: "preview" });
check("submitted spoofed client query ignored", { jobStatus: 3, isSubmittedOnchain: true }, { access: "locked", mode: "locked" });
check("submitted random", { jobStatus: 3, isSubmittedOnchain: true, viewerWallet: random }, { access: "locked", mode: "locked" });
check("completed restricted client", { jobStatus: 4, isSubmittedOnchain: true, viewerWallet: client }, { access: "full", mode: "full" });
check("completed restricted public locked", { jobStatus: 4, isSubmittedOnchain: true }, { access: "locked", mode: "locked" });
check("completed public without signed session", { jobStatus: 4, isSubmittedOnchain: true, visibility: "public" }, { access: "full", mode: "full" });
check("disputed client", { jobStatus: 6, isSubmittedOnchain: true, viewerWallet: client }, { access: "preview", mode: "disputed" });
check("self-use detected but not explicit stays sealed", { jobStatus: 2, isSubmittedOnchain: false, viewerWallet: owner, clientWallet: owner, isSelfUse: true }, { access: "preview", mode: "draft" });
check("self-use explicit owner unlock", { jobStatus: 2, isSubmittedOnchain: false, viewerWallet: owner, clientWallet: owner, isSelfUse: true, selfUseExplicit: true }, { access: "full", mode: "draft" });

const deliverable: DeliverableRecord = {
  hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  deliverableURI: "local-deliverable://0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  chainId: 5042002,
  jobId: "7",
  agentId: "4",
  agentName: "AccessCheck",
  agentCategory: "Research",
  jobTitle: "Protected report access check",
  jobDescription: "Verify that protected report content is never serialized early.",
  deliverableType: "research",
  generatedTitle: "Protected ArcPilot Report",
  generatedContent: reportSentinel,
  qualityChecklist: ["Protected output stays protected"],
  raw: { reportSentinel },
  createdAt: "2026-01-01T00:00:00.000Z"
};

for (const access of ["locked", "preview"] as const) {
  const serialized = JSON.stringify(toApiDeliverable(deliverable, access));
  assert(!serialized.includes(reportSentinel), `${access}: generated content leaked`);
  assert(!serialized.includes("generated_content"), `${access}: generated_content key leaked`);
  assert(!serialized.includes("\"raw\""), `${access}: raw payload leaked`);
  console.log(`ok ${access} payload: report body and raw fields omitted`);
}

const fullPayload = JSON.stringify(toApiDeliverable(deliverable, "full"));
assert(fullPayload.includes(reportSentinel), "full: generated content missing");
assert(!fullPayload.includes("\"raw\""), "full: raw payload leaked");
console.log("ok full payload: report body present and raw field omitted");

const token = createWalletSessionToken(owner, testSecret);
assert.equal(verifyWalletSessionToken(token, testSecret)?.wallet, owner, "signed session wallet");
assert.equal(verifyWalletSessionToken(`${token}tampered`, testSecret), null, "tampered session token");
console.log("ok wallet session: signed token verifies and tampered token is rejected");

const marketplaceAgent = withPublicMarketplaceStats({
  agentId: 9n,
  owner,
  stats: { completedJobs: 2n, lifetimeEarned: 200_000_000n },
  reputationScore: 900n
}, [
  { agentId: 9n, client: owner, status: 4, amount: 100_000_000n, resolvedAt: 10n },
  { agentId: 9n, client, status: 4, amount: 100_000_000n, resolvedAt: 20n }
]);
assert.equal(marketplaceAgent.stats.completedJobs, 1n, "self-use completed job leaked into public stats");
assert.equal(marketplaceAgent.stats.lifetimeEarned, 100_000_000n, "self-use earnings leaked into public stats");
assert.equal(marketplaceAgent.marketplaceStats.selfUseJobs, 1, "self-use run count");
console.log("ok marketplace reputation: self-use jobs excluded from public completed work and earnings");

console.log("Deliverable access policy checks passed.");
