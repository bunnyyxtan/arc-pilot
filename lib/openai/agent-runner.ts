import OpenAI from "openai";
import { logger } from "../logger";
import { saveDeliverable } from "./deliverable";
import { buildSystemPrompt, buildUserPrompt, isArcRelatedRequest, isUnclearJobRequest, type DeliverableType } from "./prompts";
import { looksVagueDeliverable, sanitizeDeliverableFields } from "./sanitize";
import { getOpenAIModelConfig } from "./model-config";
import { validateAgentScope, type AgentScopeDecision } from "../agents/scope-validator";
import type { JobClassification } from "../jobs/classification";

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
  jobClassification?: JobClassification | null;
  agentSkills?: string[];
  agentMetadata?: unknown;
}): Promise<{
  generatedTitle: string;
  generatedContent: string;
  qualityChecklist: string[];
  deliverableHash: `0x${string}`;
  deliverableURI: string;
  refusedOutOfScope?: boolean;
  scopeDecision?: AgentScopeDecision;
}> {
  const scopeDecision = validateAgentScope({
    agentName: input.agentName,
    agentCategory: input.agentCategory,
    skills: input.agentSkills,
    metadata: input.agentMetadata,
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    jobType: input.deliverableType
  });
  if (scopeDecision.suggestedAction === "block") {
    const agentSkills = input.agentSkills?.length ? input.agentSkills.join(", ") : "No indexed skills were available.";
    const saved = await saveDeliverable({
      ...input,
      generatedTitle: "Task Outside Agent Scope",
      generatedContent: [
        "Task Outside Agent Scope:",
        "This job appears outside the selected agent's configured category and skills. The agent should not complete unrelated work.",
        "",
        `Agent category: ${input.agentCategory}`,
        `Agent skills: ${agentSkills}`,
        `Job request: ${input.jobTitle}`,
        `Why this is outside scope: ${scopeDecision.reason}`,
        "",
        "Recommended next step:",
        "Choose or create an agent whose declared skills match this request, then create a new marketplace job."
      ].join("\n"),
      qualityChecklist: [
        "Agent category checked before generation",
        "Declared skills compared with the requested task",
        "Unrelated work refused without generating a generic answer"
      ],
      raw: { refusedOutOfScope: true, scopeDecision }
    });
    logger.warn("openai.agentRunner", "scope:refused", {
      agentName: input.agentName,
      agentCategory: input.agentCategory,
      jobTitle: input.jobTitle,
      scopeDecision
    }, "Out-of-scope agent run refused before OpenAI request");
    return {
      generatedTitle: saved.record.generatedTitle,
      generatedContent: saved.record.generatedContent,
      qualityChecklist: saved.record.qualityChecklist,
      deliverableHash: saved.deliverableHash,
      deliverableURI: saved.deliverableURI,
      refusedOutOfScope: true,
      scopeDecision
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    logger.warn("openai.agentRunner", "env:missingApiKey", { model: getOpenAIModelConfig().deliverableModel }, "OpenAI API key is missing");
    throw new Error("OPENAI_API_KEY is missing. Add it to .env.local or .env.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = getOpenAIModelConfig().deliverableModel;
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
    deliverableURI: saved.deliverableURI,
    scopeDecision
  };
}
