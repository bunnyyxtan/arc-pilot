import { strict as assert } from "node:assert";
import { validateAgentScope } from "../lib/agents/scope-validator";
import { applyReviewGuard, evidenceWasSubmitted, type ReviewRubricScores } from "../lib/disputes/review-guard";

const validSongListScores: ReviewRubricScores = {
  jobMatch: 95,
  completeness: 90,
  deliverableQuality: 85,
  clientReasonSpecificity: 10,
  evidenceStrength: 0,
  scopeAlignment: 90,
  badFaithRisk: 10
};

const arcResearchSongListScores: ReviewRubricScores = {
  jobMatch: 10,
  completeness: 20,
  deliverableQuality: 15,
  clientReasonSpecificity: 80,
  evidenceStrength: 70,
  scopeAlignment: 10,
  badFaithRisk: 5
};

const guardedValidSongs = applyReviewGuard({
  modelRecommendation: "client_wins",
  confidence: 0.88,
  agentBps: 0,
  clientBps: 10000,
  slashAmount: "0",
  rubricScores: validSongListScores,
  rejectionReason: "low quality",
  evidenceCount: 0,
  deliverablePresent: true,
  scopeAssessment: "in_scope"
});
assert.notEqual(guardedValidSongs.guardedRecommendation, "client_wins", "Case 1: unsupported client wins must be blocked");
console.log("ok case 1: valid song list + vague rejection does not award client wins");

const guardedWrongResearch = applyReviewGuard({
  modelRecommendation: "client_wins",
  confidence: 0.9,
  agentBps: 0,
  clientBps: 10000,
  slashAmount: "0",
  rubricScores: arcResearchSongListScores,
  rejectionReason: "The requested Arc research report was replaced with unrelated song recommendations.",
  evidenceCount: 1,
  deliverablePresent: true,
  scopeAssessment: "in_scope"
});
assert.equal(guardedWrongResearch.guardedRecommendation, "client_wins", "Case 2: unrelated deliverable should permit client wins");
console.log("ok case 2: Arc research request + song list permits client wins");

const researchSongs = validateAgentScope({
  agentName: "ResearchPilot",
  agentCategory: "Research",
  skills: ["Arc research", "market intelligence", "technical summaries"],
  jobTitle: "Recommend ten peaceful songs",
  jobDescription: "Give me a playlist with ten peaceful songs for a calm evening.",
  jobType: "music recommendation"
});
assert.equal(researchSongs.suggestedAction, "block", "Case 3: research agent must block music recommendations");
console.log("ok case 3: Research agent rejects music recommendation request");

const tradingAnalysis = validateAgentScope({
  agentName: "TradePilot",
  agentCategory: "Trading",
  skills: ["token analysis", "chart interpretation", "market strategy"],
  jobTitle: "Analyze token market setup",
  jobDescription: "Review token price action and propose a risk-aware trading strategy.",
  jobType: "trading"
});
assert.equal(tradingAnalysis.inScope, true, "Case 4: trading token analysis should be in scope");
console.log("ok case 4: Trading agent accepts token analysis request");

assert.equal(evidenceWasSubmitted(0), false, "Case 5: evidenceConsidered must be false when there are no evidence rows");
console.log("ok case 5: zero evidence rows compute evidenceConsidered=false");

assert(["medium", "high"].includes(guardedValidSongs.badFaithRisk), "Case 6: vague unsupported rejection should elevate bad-faith risk");
assert.notEqual(guardedValidSongs.guardedRecommendation, "client_wins", "Case 6: guard must block unsupported client wins");
console.log("ok case 6: vague rejection elevates risk and blocks unsupported client wins");
