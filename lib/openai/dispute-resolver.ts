import OpenAI from "openai";
import { logger } from "../logger";
import { getOpenAIModelConfig } from "./model-config";

export type DisputeResolutionOutcome = "agent_wins" | "client_wins" | "split" | "manual_review_required";

export type AIDisputeReview = {
  recommendedOutcome: DisputeResolutionOutcome;
  confidence: number;
  agentBps: number;
  clientBps: number;
  slashAmount: string;
  reasoning: string;
  evidenceSummary: string;
  fairnessNotes: string;
  riskFlags: string[];
};

type RawReview = Partial<Record<keyof AIDisputeReview, unknown>>;

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractFirstJsonObject(value: string): RawReview | null {
  const stripped = stripJsonFence(value);
  try {
    return JSON.parse(stripped) as RawReview;
  } catch {
    const start = stripped.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < stripped.length; index += 1) {
      const character = stripped[index];
      if (escaped) { escaped = false; continue; }
      if (character === "\\") { escaped = true; continue; }
      if (character === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(stripped.slice(start, index + 1)) as RawReview;
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeReview(raw: RawReview): AIDisputeReview {
  const allowed = new Set<DisputeResolutionOutcome>(["agent_wins", "client_wins", "split", "manual_review_required"]);
  let recommendedOutcome = allowed.has(raw.recommendedOutcome as DisputeResolutionOutcome)
    ? raw.recommendedOutcome as DisputeResolutionOutcome
    : "manual_review_required";
  const confidence = Math.min(1, Math.max(0, typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence) || 0));
  if (confidence < 0.65) recommendedOutcome = "manual_review_required";

  let agentBps = Number.isInteger(Number(raw.agentBps)) ? Number(raw.agentBps) : recommendedOutcome === "agent_wins" ? 10000 : 0;
  let clientBps = Number.isInteger(Number(raw.clientBps)) ? Number(raw.clientBps) : recommendedOutcome === "client_wins" ? 10000 : 0;
  if (recommendedOutcome === "agent_wins") [agentBps, clientBps] = [10000, 0];
  if (recommendedOutcome === "client_wins") [agentBps, clientBps] = [0, 10000];
  if (recommendedOutcome === "manual_review_required") [agentBps, clientBps] = [0, 0];
  if (recommendedOutcome === "split" && (agentBps < 0 || clientBps < 0 || agentBps + clientBps !== 10000)) {
    recommendedOutcome = "manual_review_required";
    agentBps = 0;
    clientBps = 0;
  }

  const slashAmount = typeof raw.slashAmount === "string" && /^\d+(?:\.\d{1,6})?$/.test(raw.slashAmount.trim())
    ? raw.slashAmount.trim()
    : "0";
  const riskFlags = Array.isArray(raw.riskFlags)
    ? raw.riskFlags.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 12)
    : [];

  return {
    recommendedOutcome,
    confidence,
    agentBps,
    clientBps,
    slashAmount,
    reasoning: cleanText(raw.reasoning, "The available context is insufficient for a reliable automated decision."),
    evidenceSummary: cleanText(raw.evidenceSummary, "No additional evidence summary was provided."),
    fairnessNotes: cleanText(raw.fairnessNotes, "Manual review is recommended when the available evidence is incomplete."),
    riskFlags
  };
}

function systemPrompt() {
  return [
    "You are the impartial ArcPilot AI Dispute Resolver Agent for paid USDC escrow jobs on Arc Testnet.",
    "Evaluate the original job request, generated deliverable, client rejection reason, submitted evidence, job metadata, agent metadata, escrow amount, and client bond.",
    "Be strict but fair. Do not blindly side with either party.",
    "If a rejection reason is vague, reduce client credibility.",
    "If the deliverable is generic, incomplete, wrong, or off-topic, favor the client or recommend a split.",
    "If both parties have partial merit, recommend a split with agentBps + clientBps = 10000.",
    "If evidence is insufficient or confidence is below 0.65, use manual_review_required.",
    "Return JSON only. No markdown. No code fences. No extra text.",
    'Use this exact shape: {"recommendedOutcome":"agent_wins|client_wins|split|manual_review_required","confidence":0.82,"agentBps":10000,"clientBps":0,"slashAmount":"0","reasoning":"string","evidenceSummary":"string","fairnessNotes":"string","riskFlags":["string"]}.'
  ].join("\n");
}

export async function runAIDisputeReview(context: Record<string, unknown>) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Add it to .env.local or .env.");
  }
  const model = getOpenAIModelConfig().disputeModel;
  logger.info("openai.disputeResolver", "review:start", { model }, "AI dispute review starting");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.15,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: `Review this ArcPilot escrow dispute context and return the required JSON judgment:\n${JSON.stringify(context)}` }
    ]
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty dispute review response.");
  const parsed = extractFirstJsonObject(content);
  if (!parsed) throw new Error("OpenAI dispute review response could not be parsed as JSON.");
  const review = normalizeReview(parsed);
  logger.info("openai.disputeResolver", "review:success", {
    model,
    recommendedOutcome: review.recommendedOutcome,
    confidence: review.confidence
  }, "AI dispute review completed");
  return { model, review };
}
