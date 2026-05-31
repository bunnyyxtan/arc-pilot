function slugFromName(agentName: string | undefined) {
  const normalized = String(agentName || "")
    .replace(/pilot/i, "")
    .replace(/agent/i, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();

  if (normalized.length >= 3) return normalized.slice(0, 3);
  if (normalized.length > 0) return normalized.padEnd(3, "X");
  return "ARC";
}

export function formatAgentDisplayId(agentName: string | undefined, agentId: bigint | string | number | undefined) {
  const numeric = Number(agentId ?? 0);
  const padded = Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric).toString().padStart(4, "0") : "0000";
  return `AGT-${slugFromName(agentName)}-${padded}`;
}
