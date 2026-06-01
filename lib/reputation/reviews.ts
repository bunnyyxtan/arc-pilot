import { getOptionalServiceRoleSupabaseClient } from "../supabase/server";
import type { AgentReviewRow } from "../supabase/types";

export type AgentReviewSummary = {
  averageRating: number;
  reviewCount: number;
};

export const EMPTY_AGENT_REVIEW_SUMMARY: AgentReviewSummary = {
  averageRating: 0,
  reviewCount: 0
};

export async function getAgentReviewSummaries(agentIds: Array<string | number | bigint>) {
  const summaries = new Map<string, AgentReviewSummary>();
  for (const id of agentIds) summaries.set(String(id), { ...EMPTY_AGENT_REVIEW_SUMMARY });
  if (agentIds.length === 0) return summaries;
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return summaries;
  const { data, error } = await supabase
    .from("agent_reviews")
    .select("agent_id,rating")
    .in("agent_id", agentIds.map(String));
  if (error) return summaries;
  const buckets = new Map<string, number[]>();
  for (const row of data ?? []) {
    const id = String(row.agent_id);
    const ratings = buckets.get(id) ?? [];
    ratings.push(Number(row.rating));
    buckets.set(id, ratings);
  }
  for (const [id, ratings] of buckets) {
    summaries.set(id, {
      averageRating: Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10,
      reviewCount: ratings.length
    });
  }
  return summaries;
}

export async function withAgentReviewSummaries<T extends Record<string, unknown>>(agents: T[]) {
  const summaries = await getAgentReviewSummaries(agents.map((agent) => String(agent.agentId ?? agent.agent_id ?? "")));
  return agents.map((agent) => ({
    ...agent,
    reviewSummary: summaries.get(String(agent.agentId ?? agent.agent_id ?? "")) ?? { ...EMPTY_AGENT_REVIEW_SUMMARY }
  }));
}

export async function getAgentReviews(agentId: string | number | bigint) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return [] as AgentReviewRow[];
  const { data, error } = await supabase
    .from("agent_reviews")
    .select("*")
    .eq("agent_id", String(agentId))
    .order("created_at", { ascending: false });
  if (error) return [] as AgentReviewRow[];
  return (data ?? []) as AgentReviewRow[];
}

export async function getAgentReviewForJob(agentId: string | number | bigint, jobId: string | number | bigint, clientWallet?: string | null) {
  const supabase = getOptionalServiceRoleSupabaseClient();
  if (!supabase) return null;
  let query = supabase
    .from("agent_reviews")
    .select("*")
    .eq("agent_id", String(agentId))
    .eq("job_id", String(jobId));
  if (clientWallet) query = query.eq("client_wallet", clientWallet.toLowerCase());
  const { data, error } = await query.maybeSingle();
  return error ? null : data as AgentReviewRow | null;
}
