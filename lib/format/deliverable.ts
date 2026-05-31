/**
 * Deliverable content formatter.
 * Converts raw AI output (which may contain markdown syntax) into structured
 * sections suitable for premium rendering in the UI.
 */

// ─── Sanitization ───

// Build table regexes from small fragments so Tailwind never sees bracketed
// markdown-table tokens as arbitrary utility candidates.
/* eslint-disable prefer-regex-literals */
const _BS = "\\";
const _WS = `${_BS}s`;
const _PIPE = `${_BS}|`;
const _DASH = `${_BS}x2d`;
const _COLON = `${_BS}x3a`;
const _TABLE_SEP_RE = new RegExp(`^${_WS}*${_PIPE}?[${_DASH}${_COLON}]+${_PIPE}[${_DASH}${_COLON}${_PIPE}${_WS}]+${_PIPE}?${_WS}*$`, "gm");
const _TABLE_PIPE_RE = new RegExp(`^${_WS}*${_PIPE}(.+)${_PIPE}${_WS}*$`, "gm");
/* eslint-enable prefer-regex-literals */

function normalizeLines(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/** Strip all markdown syntax from raw text */
export function stripMarkdown(value: string): string {
  return normalizeLines(value)
    // Code fences
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```(?:json|text|md|markdown|typescript|javascript|ts|js|python|py)?/gi, "").replace(/```/g, "")
    )
    // Heading markers: ### Title -> Title
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    // Bare #Heading without space
    .replace(/^\s*#([A-Za-z0-9][A-Za-z0-9 /&\-.]{2,})\s*$/gm, "$1")
    // Bold markers
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    // Italic markers
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    // Checkbox syntax
    .replace(/^\s*[-*]\s*\[[xX ]\]\s*/gm, "")
    .replace(/^\s*\[[xX ]\]\s*/gm, "")
    .replace(/^\s*-\[[xX ]\]\s*/gm, "")
    // Hashtags
    .replace(/(^|\s)#([A-Za-z0-9_]+)/g, "$1$2")
    // Markdown table separators and pipes
    // NOTE: Regex patterns are constructed at runtime to prevent Tailwind's
    // static content scanner from misinterpreting character classes as utility classes.
    .replace(_TABLE_SEP_RE, "")
    .replace(_TABLE_PIPE_RE, (_match: string, inner: string) =>
      inner.split("|").map((cell: string) => cell.trim()).filter(Boolean).join("  —  ")
    )
    // Trailing whitespace
    .replace(/[ \t]+\n/g, "\n")
    // Excessive blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Section Detection ───

export type ContentSection = {
  type: "heading" | "paragraph" | "bullet-list";
  text: string;
  items?: string[];
};

const SECTION_HEADING_RE = /^(?:\d+\.\s*)?([A-Z][A-Za-z0-9 /&().,'-]{2,}):?\s*$/;

function isSectionHeading(line: string): boolean {
  return SECTION_HEADING_RE.test(line.trim()) && line.trim().length < 80;
}

function isBulletLine(line: string): boolean {
  return /^\s*[-•*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line);
}

function cleanBullet(line: string): string {
  return line.replace(/^\s*[-•*]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").trim();
}

/** Parse sanitized text into structured content sections */
export function parseContentSections(rawContent: string): ContentSection[] {
  const cleaned = stripMarkdown(rawContent);
  const lines = cleaned.split("\n");
  const sections: ContentSection[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Check if this is a section heading
    if (isSectionHeading(line)) {
      const headingText = line.replace(/:$/, "").replace(/^\d+\.\s*/, "").trim();
      sections.push({ type: "heading", text: headingText });
      i++;
      continue;
    }

    // Check if this starts a bullet list
    if (isBulletLine(line)) {
      const items: string[] = [];
      while (i < lines.length && (isBulletLine(lines[i]) || (lines[i].trim() && !isSectionHeading(lines[i]) && items.length > 0 && /^\s{2,}/.test(lines[i])))) {
        const currentLine = lines[i].trim();
        if (!currentLine) { i++; continue; }
        if (isBulletLine(lines[i])) {
          items.push(cleanBullet(currentLine));
        } else if (items.length > 0) {
          // Continuation line
          items[items.length - 1] += " " + currentLine;
        }
        i++;
      }
      if (items.length > 0) {
        sections.push({ type: "bullet-list", text: "", items });
      }
      continue;
    }

    // Otherwise it's a paragraph - collect consecutive non-empty, non-heading, non-bullet lines
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const currentLine = lines[i].trim();
      if (!currentLine || isSectionHeading(currentLine) || isBulletLine(lines[i])) break;
      paragraphLines.push(currentLine);
      i++;
    }
    if (paragraphLines.length > 0) {
      sections.push({ type: "paragraph", text: paragraphLines.join(" ") });
    }
  }

  return sections;
}

/** Clean a checklist item, stripping markdown artifacts */
export function cleanChecklistItem(value: string): string {
  return stripMarkdown(value)
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type DeliverablePreview = {
  executiveSummary: string;
  keyFindings: string[];
  recommendations: string[];
};

function normalizeHeading(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function sentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function firstParagraphAfterHeading(sections: ContentSection[], headings: string[]) {
  const headingIndex = sections.findIndex((section) =>
    section.type === "heading" && headings.some((heading) => normalizeHeading(section.text).includes(heading))
  );
  if (headingIndex === -1) return "";
  const paragraph = sections.slice(headingIndex + 1).find((section) => section.type === "paragraph");
  return paragraph?.text || "";
}

function listAfterHeading(sections: ContentSection[], headings: string[]) {
  const headingIndex = sections.findIndex((section) =>
    section.type === "heading" && headings.some((heading) => normalizeHeading(section.text).includes(heading))
  );
  if (headingIndex === -1) return [];
  const list = sections.slice(headingIndex + 1).find((section) => section.type === "bullet-list");
  return list?.items || [];
}

/** Extract a safe review preview without exposing the complete paid result. */
export function buildDeliverablePreview(rawContent: string): DeliverablePreview {
  const sections = parseContentSections(rawContent);
  const paragraphs = sections.filter((section) => section.type === "paragraph").map((section) => section.text);
  const lists = sections.filter((section) => section.type === "bullet-list").flatMap((section) => section.items || []);
  const executiveSummary =
    firstParagraphAfterHeading(sections, ["executive summary", "overview", "reasoning summary"]) ||
    paragraphs[0] ||
    "A saved ArcPilot deliverable is ready for escrow review.";
  const keyFindings = (
    listAfterHeading(sections, ["key findings", "findings", "insights"]) ||
    []
  );
  const recommendations = (
    listAfterHeading(sections, ["recommendations", "final recommendation", "next actions", "next steps"]) ||
    []
  );

  return {
    executiveSummary: sentences(executiveSummary).slice(0, 3).join(" "),
    keyFindings: (keyFindings.length > 0 ? keyFindings : lists).slice(0, 3),
    recommendations: (recommendations.length > 0 ? recommendations : sentences(paragraphs.at(-1) || "")).slice(0, 3)
  };
}
