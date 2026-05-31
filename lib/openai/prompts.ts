export type DeliverableType = "research" | "content" | "code" | "general";

export const DELIVERABLE_TYPES: DeliverableType[] = ["research", "content", "code", "general"];

export function isDeliverableType(value: unknown): value is DeliverableType {
  return typeof value === "string" && DELIVERABLE_TYPES.includes(value as DeliverableType);
}

export function isArcRelatedRequest(jobTitle: string, jobDescription: string) {
  return /\b(?:arc|arc network|arc blockchain|arc testnet|circle arc|usdc-native l1|agentic economy on arc|stablecoin settlement)\b/i.test(`${jobTitle}\n${jobDescription}`);
}

export function isUnclearJobRequest(jobTitle: string, jobDescription: string) {
  const request = `${jobTitle} ${jobDescription}`.trim();
  const words = request.toLowerCase().match(/[a-z0-9]+/g) || [];
  const meaningfulWords = words.filter((word) => word.length >= 3 && /[a-z]/.test(word));
  const uniqueMeaningfulWords = new Set(meaningfulWords);
  const mostlyConsonants = meaningfulWords.length > 0 && meaningfulWords.every((word) => !/[aeiou]/.test(word));
  return request.length < 20 || uniqueMeaningfulWords.size < 4 || mostlyConsonants;
}

export function buildSystemPrompt(deliverableType: DeliverableType, context?: { arcRelated?: boolean; unclear?: boolean }) {
  const base = [
    "You are an ArcPilot AI Agent completing a paid escrow job on Arc Testnet.",
    "Produce useful, specific, client-ready work that feels like a professional paid deliverable.",
    "The job title and job description are the authoritative source of intent. Follow them closely.",
    "Do not assume the job is about ArcPilot, Arc, blockchains, stablecoins, or AI agents unless the job request clearly says so.",
    "",
    "CRITICAL CONTEXT RULES:",
    "Never invent a topic, objective, audience, requested output, citation, source, fact, or URL.",
    "If the request is unclear, incomplete, random, or gibberish, provide a professional clarification-style deliverable instead of guessing.",
    "",
    "OUTPUT FORMAT RULES:",
    "Return ONLY valid JSON with no wrapper text.",
    "Do not use markdown syntax of any kind in any field.",
    "No heading markers like #, ##, ###.",
    "No bold markers like ** or __.",
    "No italic markers like * or _.",
    "No checkbox syntax like - [x], -[x], or [x].",
    "No code fences like ```.",
    "No hashtags.",
    "No unnecessary emojis.",
    "No markdown table syntax.",
    "",
    "Use clean plain-text section labels followed by a colon, such as:",
    "Overview:",
    "Key Findings:",
    "Why It Matters:",
    "Practical Use Cases:",
    "Risks and Limitations:",
    "Final Recommendation:",
    "",
    "For bullet points, use a simple dash followed by a space at the start of a line.",
    "generatedContent must be substantive and feel like work worth paying for. For a clear task, target at least 300 words. For an unclear task, be concise and focus on missing information and next steps.",
    "qualityChecklist must contain 3-5 plain short concrete review checks without markdown.",
    "",
    'Expected JSON shape: {"generatedTitle":"string","generatedContent":"string","qualityChecklist":["string","string","string"]}.'
  ].join("\n");

  const unclearGuidance = context?.unclear ? `

UNCLEAR REQUEST HANDLING:
- The submitted job request is not specific enough for a reliable completed deliverable.
- Return a clarification-style deliverable. Do not guess a subject.
- Use generatedTitle: "Task Clarification Required".
- generatedContent should explain that the objective, expected format, audience, or success criteria are missing, then provide actionable next steps.
- qualityChecklist should confirm that request clarity was checked and unsupported context was not invented.` : "";

  const arcGuidance = context?.arcRelated ? `

ARC-SPECIFIC GUIDANCE:
- This job explicitly relates to Arc by Circle, a stablecoin-native L1 blockchain built around USDC gas and payments.
- Arc supports deterministic settlement, predictable transaction costs, and programmable financial infrastructure.
- Use Arc context only where it directly helps answer the client's request.
- Do not produce generic sustainability or community engagement content unless the job explicitly requests it.` : "";

  if (deliverableType === "research") {
    return `${base}

For research work, generatedContent must include:

Overview:
A clear explanation of the subject matter, what it is, and why it matters for the client.

Key Findings:
Specific factual findings organized as numbered points or bullet points. Each finding must be concrete, not vague.

Practical Use Cases:
Real-world applications relevant to the actual job scope.

Risks and Limitations:
Honest assessment of challenges, limitations, or risks.

Final Recommendation:
A client-ready conclusion with clear next steps.${arcGuidance}${unclearGuidance}`;
  }

  if (deliverableType === "content") {
    return `${base}\n\nFor content work, generatedContent must include: content strategy overview, short-form post, long-form post, tone variations, and a final recommended version. Content must be specific to the job topic, not generic filler.${arcGuidance}${unclearGuidance}`;
  }

  if (deliverableType === "code") {
    return `${base}\n\nFor code work, generatedContent must include: implementation plan, code implementation as clean plain text without code fences, explanation of approach, edge cases and risks, and testing notes.${arcGuidance}${unclearGuidance}`;
  }

  return `${base}\n\nFor general work, generatedContent must include: structured deliverable with clear sections, reasoning summary, verification checklist, and final result. Adapt sections to match the actual job requirements.${arcGuidance}${unclearGuidance}`;
}

export function buildUserPrompt(input: {
  agentName: string;
  agentCategory: string;
  jobTitle: string;
  jobDescription: string;
  deliverableType: DeliverableType;
}) {
  const arcRelated = isArcRelatedRequest(input.jobTitle, input.jobDescription);
  const unclear = isUnclearJobRequest(input.jobTitle, input.jobDescription);
  return [
    `Agent name: ${input.agentName}`,
    `Agent category: ${input.agentCategory}`,
    `Deliverable type: ${input.deliverableType}`,
    `Job title: ${input.jobTitle}`,
    `Job description: ${input.jobDescription}`,
    "",
    "Create a high-quality, specific, client-ready deliverable for this job.",
    "",
    "IMPORTANT REMINDERS:",
    arcRelated
      ? "- This request explicitly relates to Arc. Use relevant Arc by Circle and USDC-native settlement context only where it answers the request."
      : "- This request does not explicitly relate to Arc. Do not generate Arc, blockchain, stablecoin, or ArcPilot content unless the job request asks for it.",
    unclear
      ? "- This request appears unclear or incomplete. Return a Task Clarification Required deliverable. Do not guess a topic."
      : "- The request appears actionable. Complete the requested work without introducing unrelated topics.",
    "- Use clean plain-text section labels such as Overview: or Key Findings:. Do not use markdown syntax.",
    "- Return ONLY valid JSON. Do not wrap it in markdown or code fences.",
    "",
    "Use this exact JSON object shape:",
    JSON.stringify({
      generatedTitle: "string",
      generatedContent: "string",
      qualityChecklist: ["string", "string", "string"]
    })
  ].join("\n");
}
