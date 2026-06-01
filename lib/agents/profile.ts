import { getOptionalServiceRoleSupabaseClient } from "../supabase/server";

export function parseAgentSkills(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export async function loadAgentScopeProfile(agent: { metadataURI?: unknown; category?: unknown }) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase || typeof agent.metadataURI !== "string" || !agent.metadataURI) {
    return { category: String(agent.category || ""), skills: [] as string[], metadata: null };
  }
  const { data } = await supabase
    .from("agent_metadata")
    .select("category,skills,metadata")
    .eq("metadata_uri", agent.metadataURI)
    .maybeSingle();
  return {
    category: String(data?.category || agent.category || ""),
    skills: parseAgentSkills(data?.skills),
    metadata: data?.metadata ?? null
  };
}
