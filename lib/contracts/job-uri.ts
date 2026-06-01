export type JobURIPayload = {
  title: string;
  description: string;
  deliverableVisibility?: "public" | "restricted";
  jobMode?: "marketplace" | "self_use";
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
    return {
      title: parsed.title,
      description: parsed.description,
      deliverableVisibility: parsed.deliverableVisibility === "public" ? "public" : parsed.deliverableVisibility === "restricted" ? "restricted" : undefined,
      jobMode: parsed.jobMode === "self_use" ? "self_use" : parsed.jobMode === "marketplace" ? "marketplace" : undefined
    };
  } catch {
    return null;
  }
}
