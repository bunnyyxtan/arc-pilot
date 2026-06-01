import { logger } from "../logger";

const DEFAULT_MODEL = "gpt-4o-mini";

export function getOpenAIModelConfig() {
  const configuredDeliverable = process.env.OPENAI_MODEL?.trim();
  const configuredDispute = process.env.OPENAI_DISPUTE_MODEL?.trim();
  if (!configuredDeliverable) {
    logger.warn("openai.modelConfig", "deliverable:default", { defaultModel: DEFAULT_MODEL }, "OPENAI_MODEL is missing; using the safe default");
  }
  return {
    deliverableModel: configuredDeliverable || DEFAULT_MODEL,
    disputeModel: configuredDispute || configuredDeliverable || DEFAULT_MODEL,
    source: configuredDeliverable ? "env" as const : "default" as const
  };
}
