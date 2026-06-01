import { strict as assert } from "node:assert";
import {
  isMarketplaceJob,
  isSelfUseJob,
  normalizeJobClassification,
  resolveJobClassification,
  shouldCountTowardPublicRatings
} from "../lib/jobs/classification";
import { withPublicMarketplaceStats } from "../lib/reputation/public-stats";

const owner = "0x1111111111111111111111111111111111111111";
const client = "0x2222222222222222222222222222222222222222";

assert.equal(normalizeJobClassification("Marketplace Job"), "marketplace");
console.log("ok case 1: marketplace variants normalize canonically");

assert.equal(normalizeJobClassification("self-use"), "self_use");
console.log("ok case 2: self-use variants normalize canonically");

assert.equal(resolveJobClassification({ storedClassification: "marketplace", client, agentOwner: owner }), "marketplace");
console.log("ok case 3: explicit stored marketplace classification remains marketplace");

assert.equal(resolveJobClassification({ metadataClassification: "marketplace", client: owner, agentOwner: owner }), "marketplace");
console.log("ok case 4: marketplace metadata overrides same-wallet fallback");

assert.equal(resolveJobClassification({ metadataClassification: "self_use", client, agentOwner: owner }), "self_use");
console.log("ok case 5: explicit self-use metadata remains self-use");

assert.equal(resolveJobClassification({ client: owner.toUpperCase(), agentOwner: owner }), "self_use");
console.log("ok case 6: legacy same-wallet job falls back to self-use");

assert.equal(resolveJobClassification({ metadataClassification: "unknown legacy value", client, agentOwner: owner }), "marketplace");
console.log("ok case 7: unknown legacy classification defaults safely to marketplace");

assert.equal(isMarketplaceJob({ explicitClassification: "marketplace", client: owner, agentOwner: owner }), true);
assert.equal(isSelfUseJob({ explicitClassification: "self_use", client, agentOwner: owner }), true);
assert.equal(shouldCountTowardPublicRatings({ explicitClassification: "marketplace", client: owner, agentOwner: owner }), true);
assert.equal(shouldCountTowardPublicRatings({ explicitClassification: "self_use", client, agentOwner: owner }), false);
console.log("ok case 8: public ratings follow canonical classification, not wallet coincidence");

const publicAgent = withPublicMarketplaceStats({ agentId: 7n, owner, stats: {}, reputationScore: 0n }, [
  { agentId: 7n, client: owner, jobClassification: "marketplace", status: 4, amount: 10_000_000n, resolvedAt: 1n },
  { agentId: 7n, client, jobClassification: "self_use", status: 4, amount: 20_000_000n, resolvedAt: 2n }
]);
assert.equal(publicAgent.stats.completedJobs, 1n);
assert.equal(publicAgent.stats.lifetimeEarned, 10_000_000n);
console.log("ok public stats: explicit marketplace same-wallet work counts and explicit self-use work does not");

console.log("Job classification checks passed.");
