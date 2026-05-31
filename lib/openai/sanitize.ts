function normalizeLines(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

export function sanitizeDeliverableText(value: string) {
  return normalizeLines(value)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```(?:json|text|md|markdown)?/gi, "").replace(/```/g, ""))
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*#([A-Za-z0-9][A-Za-z0-9 /&-]{2,})\s*$/gm, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/^\s*[-*]\s*\[[xX ]\]\s*/gm, "")
    .replace(/^\s*\[[xX ]\]\s*/gm, "")
    .replace(/^\s*-\[[xX ]\]\s*/gm, "")
    .replace(/^\s*[-*]\s+(?=[A-Z][A-Za-z ]{2,}:)/gm, "")
    .replace(/(^|\s)#([A-Za-z0-9_]+)/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeChecklistItem(value: string) {
  return sanitizeDeliverableText(value)
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeDeliverableFields(input: {
  generatedTitle: string;
  generatedContent: string;
  qualityChecklist: string[];
}) {
  const generatedTitle = sanitizeDeliverableText(input.generatedTitle)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const generatedContent = sanitizeDeliverableText(input.generatedContent);
  const qualityChecklist = input.qualityChecklist
    .map(sanitizeChecklistItem)
    .filter(Boolean);

  return {
    generatedTitle,
    generatedContent,
    qualityChecklist
  };
}

export function looksVagueDeliverable(content: string) {
  const normalized = content.toLowerCase();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const hasStructure = /overview:|key findings:|risks:|recommendation:|final recommendation:|why it matters:/i.test(content);
  const vagueSignals = [
    "sustainability",
    "community engagement",
    "raise awareness",
    "generic",
    "more research is needed"
  ].filter((signal) => normalized.includes(signal)).length;

  return wordCount < 120 || !hasStructure || vagueSignals >= 2;
}
