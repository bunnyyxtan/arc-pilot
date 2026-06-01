import { NextResponse } from "next/server";
import { getDisputeIndexStatus } from "../../../../lib/indexer/dispute-sync";
import { logger } from "../../../../lib/logger";
import { createServiceRoleSupabaseClient } from "../../../../lib/supabase/server";

const TABLES = [
  "indexed_agents",
  "indexed_jobs",
  "indexed_disputes",
  "deliverables",
  "dispute_metadata",
  "dispute_evidence",
  "ai_dispute_reviews",
  "job_scope_checks",
  "agent_reviews",
  "job_regenerations",
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
      .select("chain_id,agent_id,display_id,owner_wallet,owner,name,category,skills,metadata_uri,operating_wallet,reserve_wallet,active,access_mode,trust_bond,lifetime_earned,completed_jobs,disputed_jobs,avg_score,reputation_score,created_at_onchain,raw,updated_at")
      .limit(1);
    if (indexedAgentColumnsError) warnings.push(`indexed_agents columns: ${indexedAgentColumnsError.message}`);
    const { error: indexedJobColumnsError } = await supabase
      .from("indexed_jobs")
      .select("chain_id,job_id,agent_id,client,status,status_label,deliverable_uri,deliverable_hash,visibility,job_classification,payload,updated_at")
      .limit(1);
    if (indexedJobColumnsError) warnings.push(`indexed_jobs columns: ${indexedJobColumnsError.message}`);
    const { error: indexedDisputeColumnsError } = await supabase
      .from("indexed_disputes")
      .select("dispute_id,job_id,opened_by,outcome,resolved,payload,updated_at")
      .limit(1);
    if (indexedDisputeColumnsError) warnings.push(`indexed_disputes columns: ${indexedDisputeColumnsError.message}`);
    const { error: appEventsColumnsError } = await supabase.from("app_events").select("id,event_type,source,payload,event_key,created_at").limit(1);
    if (appEventsColumnsError) warnings.push(`app_events columns: ${appEventsColumnsError.message}`);
    const { error: deliverableColumnsError } = await supabase.from("deliverables").select("deliverable_hash,deliverable_uri,chain_id,job_id,agent_id,agent_name,agent_category,job_title,job_description,deliverable_type,generated_title,generated_content,quality_checklist,created_by_wallet,tx_hash,visibility,client_wallet,agent_owner_wallet,evaluator_wallet,raw,created_at").limit(1);
    if (deliverableColumnsError) warnings.push(`deliverables columns: ${deliverableColumnsError.message}`);
    const { error: aiReviewColumnsError } = await supabase.from("ai_dispute_reviews").select("review_round,parent_review_id,is_active,rubric_scores,model_recommendation,guarded_recommendation,evidence_considered,client_claim_strength,agent_deliverable_strength,scope_assessment,bad_faith_risk").limit(1);
    if (aiReviewColumnsError) warnings.push(`ai_dispute_reviews columns: ${aiReviewColumnsError.message}`);
    const { error: manualReviewColumnsError } = await supabase.from("manual_review_requests").select("reviewed_by_wallet,resolver_note,resolved_at").limit(1);
    if (manualReviewColumnsError) warnings.push(`manual_review_requests columns: ${manualReviewColumnsError.message}`);
    const { error: disputeEvidenceColumnsError } = await supabase.from("dispute_evidence").select("submitted_by_role").limit(1);
    if (disputeEvidenceColumnsError) warnings.push(`dispute_evidence columns: ${disputeEvidenceColumnsError.message}`);
    const { error: jobScopeColumnsError } = await supabase.from("job_scope_checks").select("chain_id,job_id,agent_id,client_wallet,job_title,job_description,agent_category,agent_skills,in_scope,scope_confidence,scope_reason,matched_skills,missing_capabilities,decision,raw,created_at").limit(1);
    if (jobScopeColumnsError) warnings.push(`job_scope_checks columns: ${jobScopeColumnsError.message}`);
    const { error: agentReviewColumnsError } = await supabase.from("agent_reviews").select("chain_id,agent_id,job_id,client_wallet,rating,review_text,tags,review_context,raw,created_at,updated_at").limit(1);
    if (agentReviewColumnsError) warnings.push(`agent_reviews columns: ${agentReviewColumnsError.message}`);
    const { error: regenerationColumnsError } = await supabase.from("job_regenerations").select("chain_id,job_id,agent_id,requested_by_wallet,attempt_number,deliverable_hash,deliverable_uri,raw,created_at").limit(1);
    if (regenerationColumnsError) warnings.push(`job_regenerations columns: ${regenerationColumnsError.message}`);
    let disputeIndex = null;
    try {
      disputeIndex = await getDisputeIndexStatus("arcTestnet");
      if (disputeIndex.stale) warnings.push("indexed_disputes is stale");
    } catch (error) {
      warnings.push(`dispute index diagnostics: ${error instanceof Error ? error.message : String(error)}`);
    }
    return NextResponse.json({
      ok: warnings.length === 0,
      configured: true,
      supabase: "reachable",
      serviceRole: "configured",
      counts,
      tables: counts,
      disputeIndex,
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
      disputeIndex: null,
      warnings: [error instanceof Error ? error.message : "Supabase health check failed."]
    }, { status: 503 });
  }
}
