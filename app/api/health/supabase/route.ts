import { NextResponse } from "next/server";
import { logger } from "../../../../lib/logger";
import { createServiceRoleSupabaseClient } from "../../../../lib/supabase/server";

const TABLES = [
  "indexed_agents",
  "indexed_jobs",
  "indexed_disputes",
  "deliverables",
  "dispute_metadata",
  "ai_dispute_reviews",
  "agent_metadata",
  "app_events"
] as const;

export async function GET() {
  try {
    const supabase = createServiceRoleSupabaseClient();
    const counts: Record<string, number> = {};
    const warnings: string[] = [];
    for (const table of TABLES) {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) {
        warnings.push(`${table}: ${error.message}`);
      } else {
        counts[table] = count ?? 0;
      }
    }
    const { error: indexedAgentColumnsError } = await supabase
      .from("indexed_agents")
      .select("chain_id,agent_id,display_id,owner_wallet,name,category,metadata_uri,trust_bond,lifetime_earned,completed_jobs,reputation_score,raw")
      .limit(1);
    if (indexedAgentColumnsError) warnings.push(`indexed_agents columns: ${indexedAgentColumnsError.message}`);
    const { error: appEventsColumnsError } = await supabase.from("app_events").select("event_type,source,payload").limit(1);
    if (appEventsColumnsError) warnings.push(`app_events columns: ${appEventsColumnsError.message}`);
    const { error: deliverableColumnsError } = await supabase.from("deliverables").select("visibility,client_wallet,agent_owner_wallet,evaluator_wallet").limit(1);
    if (deliverableColumnsError) warnings.push(`deliverables columns: ${deliverableColumnsError.message}`);
    return NextResponse.json({
      ok: warnings.length === 0,
      configured: true,
      supabase: "reachable",
      serviceRole: "configured",
      counts,
      tables: counts,
      warnings
    }, { status: warnings.length === 0 ? 200 : 503 });
  } catch (error) {
    logger.error("api.health.supabase", "read:failed", { error }, "Supabase health check failed");
    return NextResponse.json({
      ok: false,
      configured: false,
      supabase: "unavailable",
      serviceRole: "missing-or-invalid",
      counts: {},
      tables: {},
      warnings: [error instanceof Error ? error.message : "Supabase health check failed."]
    }, { status: 503 });
  }
}
