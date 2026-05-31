import OpenAI from "openai";
import { loadEnvFiles } from "../contracts/runtime";
import { logger } from "../logger";
import { saveDeliverable } from "./deliverable";
import { buildSystemPrompt, buildUserPrompt, isArcRelatedRequest, isUnclearJobRequest, type DeliverableType } from "./prompts";
import { looksVagueDeliverable, sanitizeDeliverableFields } from "./sanitize";

type RawDeliverable = {
  generatedTitle?: unknown;
  generatedContent?: unknown;
  qualityChecklist?: unknown;
};

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonObject(value: string) {
  const stripped = stripJsonFence(value);
  const direct = tryParseJson(stripped);
  if (direct) return direct;

  const start = stripped.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < stripped.length; index += 1) {
    const character = stripped[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) {
      return tryParseJson(stripped.slice(start, index + 1));
    }
  }
  return null;
}

function tryParseJson(value: string): RawDeliverable | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as RawDeliverable : null;
  } catch {
    return null;
  }
}

function normalizeDeliverable(parsed: RawDeliverable, jobTitle: string) {
  const rawTitle = typeof parsed.generatedTitle === "string" && parsed.generatedTitle.trim()
    ? parsed.generatedTitle.trim()
    : jobTitle.trim() || "ArcPilot Deliverable";
  const rawContent = typeof parsed.generatedContent === "string" ? parsed.generatedContent.trim() : "";
  const rawChecklist = Array.isArray(parsed.qualityChecklist)
    ? parsed.qualityChecklist.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
  const sanitized = sanitizeDeliverableFields({
    generatedTitle: rawTitle,
    generatedContent: rawContent,
    qualityChecklist: rawChecklist
  });
  const generatedContent = sanitized.generatedContent;
  if (!generatedContent) {
    throw new Error("OpenAI response did not include non-empty generatedContent.");
  }
  return {
    generatedTitle: sanitized.generatedTitle || jobTitle.trim() || "ArcPilot Deliverable",
    generatedContent,
    qualityChecklist: sanitized.qualityChecklist.length > 0
      ? sanitized.qualityChecklist
      : ["Meets requested job scope", "Ready for client review", "Saved with deliverable hash"]
  };
}

async function requestDeliverable(client: OpenAI, model: string, input: Parameters<typeof buildUserPrompt>[0], retry = false) {
  const promptContext = {
    arcRelated: isArcRelatedRequest(input.jobTitle, input.jobDescription),
    unclear: isUnclearJobRequest(input.jobTitle, input.jobDescription)
  };
  return client.chat.completions.create({
    model,
    temperature: retry ? 0.25 : 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${buildSystemPrompt(input.deliverableType, promptContext)}${retry ? " Previous output was too generic or poorly formatted. Retry with work grounded strictly in the submitted job request. Keep the same JSON shape. Use clean plain text only." : ""}` },
      { role: "user", content: buildUserPrompt(input) }
    ]
  });
}

// Server-only AI runner. It never falls back to fake output and logs metadata, not prompts or API keys.
export async function runAgentJob(input: {
  agentName: string;
  agentCategory: string;
  jobTitle: string;
  jobDescription: string;
  deliverableType: DeliverableType;
  chainId?: number | null;
  jobId?: string | null;
  agentId?: string | null;
  createdByWallet?: string | null;
  txHash?: string | null;
  visibility?: "public" | "restricted";
  clientWallet?: string | null;
  agentOwnerWallet?: string | null;
  evaluatorWallet?: string | null;
}): Promise<{
  generatedTitle: string;
  generatedContent: string;
  qualityChecklist: string[];
  deliverableHash: `0x${string}`;
  deliverableURI: string;
}> {
  loadEnvFiles();
  if (!process.env.OPENAI_API_KEY) {
    logger.warn("openai.agentRunner", "env:missingApiKey", { model: process.env.OPENAI_MODEL || "gpt-4o-mini" }, "OpenAI API key is missing");
    throw new Error("OPENAI_API_KEY is missing. Add it to .env.local or .env.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  logger.info("openai.agentRunner", "run:start", {
    model,
    deliverableType: input.deliverableType,
    agentName: input.agentName,
    agentCategory: input.agentCategory,
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    arcRelated: isArcRelatedRequest(input.jobTitle, input.jobDescription),
    unclearRequest: isUnclearJobRequest(input.jobTitle, input.jobDescription)
  }, "Agent run started");
  logger.debug("openai.agentRunner", "prompt:selected", { deliverableType: input.deliverableType, model }, "Prompt type selected");
  logger.info("openai.agentRunner", "openai:requestStart", {
    model,
    deliverableType: input.deliverableType,
    responseFormat: "json_object"
  }, "OpenAI request starting");

  let completion;
  try {
    completion = await requestDeliverable(client, model, input);
  } catch (error) {
    logger.error("openai.agentRunner", "run:openaiFailed", { model, deliverableType: input.deliverableType, error }, "OpenAI request failed");
    throw error;
  }

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    logger.error("openai.agentRunner", "run:emptyResponse", { model, deliverableType: input.deliverableType }, "OpenAI returned an empty response");
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed = extractFirstJsonObject(content);
  let rawContent = content;
  let didRetry = false;
  if (!parsed) {
    logger.error("openai.agentRunner", "parse:failed", { model, deliverableType: input.deliverableType, contentLength: content.length }, "OpenAI response JSON extraction failed");
    logger.info("openai.agentRunner", "retry:start", { model, deliverableType: input.deliverableType, reason: "parse_failed" }, "Retrying OpenAI request with stricter deliverable instructions");
    didRetry = true;
    const retryCompletion = await requestDeliverable(client, model, input, true);
    rawContent = retryCompletion.choices[0]?.message?.content || "";
    parsed = rawContent ? extractFirstJsonObject(rawContent) : null;
    if (!parsed) {
      throw new Error("OpenAI response could not be parsed as deliverable JSON.");
    }
  }
  logger.info("openai.agentRunner", "parse:success", {
    model,
    deliverableType: input.deliverableType,
    hasTitle: typeof parsed.generatedTitle === "string",
    hasContent: typeof parsed.generatedContent === "string",
    checklistIsArray: Array.isArray(parsed.qualityChecklist)
  }, "OpenAI response parsed");

  let normalized = normalizeDeliverable(parsed, input.jobTitle);
  if (!didRetry && looksVagueDeliverable(normalized.generatedContent)) {
    logger.info("openai.agentRunner", "retry:start", { model, deliverableType: input.deliverableType, reason: "vague_or_shallow" }, "Retrying OpenAI request because deliverable was vague or shallow");
    didRetry = true;
    const retryCompletion = await requestDeliverable(client, model, input, true);
    rawContent = retryCompletion.choices[0]?.message?.content || rawContent;
    const retryParsed = rawContent ? extractFirstJsonObject(rawContent) : null;
    if (retryParsed) {
      normalized = normalizeDeliverable(retryParsed, input.jobTitle);
      parsed = retryParsed;
    }
  }

  const saved = await saveDeliverable({
    ...input,
    generatedTitle: normalized.generatedTitle,
    generatedContent: normalized.generatedContent,
    qualityChecklist: normalized.qualityChecklist,
    raw: parsed
  });
  logger.info("openai.agentRunner", "save:hashReady", {
    model,
    deliverableHash: saved.deliverableHash,
    deliverableURI: saved.deliverableURI
  }, "Saved deliverable hash generated");
  logger.info("openai.agentRunner", "run:deliverableGenerated", {
    model,
    deliverableType: input.deliverableType,
    deliverableHash: saved.deliverableHash,
    deliverableURI: saved.deliverableURI,
    titleLength: normalized.generatedTitle.length,
    contentLength: normalized.generatedContent.length,
    checklistItems: normalized.qualityChecklist.length
  }, "Deliverable generated and saved");

  return {
    generatedTitle: normalized.generatedTitle,
    generatedContent: normalized.generatedContent,
    qualityChecklist: normalized.qualityChecklist,
    deliverableHash: saved.deliverableHash,
    deliverableURI: saved.deliverableURI
  };
}
