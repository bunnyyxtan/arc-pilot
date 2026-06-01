import { normalizeJobClassification, type JobClassification } from "../jobs/classification";

export type JobURIPayload = {
  title: string;
  description: string;
  deliverableVisibility?: "public" | "restricted";
  jobClassification?: JobClassification;
  jobMode?: JobClassification;
  scopeCheckId?: string;
  scopeDecision?: "allow" | "warn" | "block" | "override_accepted";
};

export function encodeJobURI(input: JobURIPayload) {
  const encoded = Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
  return `arcpilot-job://${encoded}`;
}

export function decodeJobURI(jobURI: string): JobURIPayload | null {
  if (!jobURI.startsWith("arcpilot-job://")) {
    return null;
  }

  try {
    const encoded = jobURI.slice("arcpilot-job://".length);
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<Record<keyof JobURIPayload, unknown>>;
    if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
      return null;
    }
    const jobClassification = normalizeJobClassification(parsed.jobClassification ?? parsed.jobMode) ?? undefined;
    return {
      title: parsed.title,
      description: parsed.description,
      deliverableVisibility: parsed.deliverableVisibility === "public" ? "public" : parsed.deliverableVisibility === "restricted" ? "restricted" : undefined,
      jobClassification,
      jobMode: jobClassification,
      scopeCheckId: typeof parsed.scopeCheckId === "string" ? parsed.scopeCheckId : undefined,
      scopeDecision: parsed.scopeDecision === "allow" || parsed.scopeDecision === "warn" || parsed.scopeDecision === "block" || parsed.scopeDecision === "override_accepted" ? parsed.scopeDecision : undefined
    };
  } catch {
    return null;
  }
}
