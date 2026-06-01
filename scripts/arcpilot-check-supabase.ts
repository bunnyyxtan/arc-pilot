import { loadEnvFiles } from "../lib/contracts/runtime";
import { createServiceRoleSupabaseClient } from "../lib/supabase/server";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const tables = ["profiles", "deliverables", "indexed_agents", "indexed_jobs", "indexed_disputes", "app_events", "dispute_metadata", "dispute_evidence", "ai_dispute_reviews", "manual_review_requests", "user_settings"] as const;

function envStatus() {
  loadEnvFiles();
  return required.map((name) => ({ name, present: Boolean(process.env[name]) }));
}

async function main() {
  console.log("ArcPilot Supabase check");
  console.table(envStatus().map((item) => ({ variable: item.name, status: item.present ? "present" : "missing" })));

  const missing = envStatus().filter((item) => !item.present).map((item) => item.name);
  if (missing.length > 0) {
    throw new Error(`Missing Supabase environment variables: ${missing.join(", ")}.`);
  }

  const supabase = createServiceRoleSupabaseClient();
  for (const table of tables) {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      if (table === "dispute_metadata" && (error.message.includes("schema cache") || error.message.includes("Could not find the table"))) {
        throw new Error(`Supabase table check failed for dispute_metadata: table is missing. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${error.message}`);
      }
      throw new Error(`Supabase table check failed for ${table}: ${error.message}`);
    }
    console.log(`ok ${table}`);
  }

  const { error: indexedAgentColumnsError } = await supabase
    .from("indexed_agents")
    .select("chain_id,agent_id,display_id,owner_wallet,name,category,metadata_uri,trust_bond,lifetime_earned,completed_jobs,reputation_score,raw")
    .limit(1);
  if (indexedAgentColumnsError) {
    throw new Error(`Supabase indexed_agents migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${indexedAgentColumnsError.message}`);
  }
  console.log("ok indexed_agents canonical columns");

  const { error: appEventsColumnsError } = await supabase
    .from("app_events")
    .select("event_type,source,payload,event_key")
    .limit(1);
  if (appEventsColumnsError) {
    throw new Error(`Supabase app_events migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${appEventsColumnsError.message}`);
  }
  console.log("ok app_events source/payload/event_key columns");

  const { error: deliverableColumnsError } = await supabase
    .from("deliverables")
    .select("visibility,client_wallet,agent_owner_wallet,evaluator_wallet")
    .limit(1);
  if (deliverableColumnsError) {
    throw new Error(`Supabase deliverables migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${deliverableColumnsError.message}`);
  }
  console.log("ok deliverables access-control columns");

  const { error: aiReviewColumnsError } = await supabase
    .from("ai_dispute_reviews")
    .select("review_round,parent_review_id,is_active,rubric_scores")
    .limit(1);
  if (aiReviewColumnsError) {
    throw new Error(`Supabase ai_dispute_reviews migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${aiReviewColumnsError.message}`);
  }
  console.log("ok ai_dispute_reviews round/rubric columns");

  const { error: manualReviewColumnsError } = await supabase
    .from("manual_review_requests")
    .select("reviewed_by_wallet,resolver_note,resolved_at")
    .limit(1);
  if (manualReviewColumnsError) {
    throw new Error(`Supabase manual_review_requests migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${manualReviewColumnsError.message}`);
  }
  console.log("ok manual_review_requests resolver queue columns");

  const createdAt = new Date().toISOString();
  const insertPayload: Record<string, unknown> = {
    event_type: "supabase_check",
    source: "script",
    created_at: createdAt
  };
  const { error: insertError } = await supabase.from("app_events").insert({
    ...insertPayload,
    payload: { check: "arcpilot-supabase-check" },
    event_key: `supabase_check:${createdAt}`
  });
  if (insertError) {
    throw new Error(`Supabase app_events write test failed: ${insertError.message}`);
  } else {
    const { error: deleteError } = await supabase
      .from("app_events")
      .delete()
      .eq("event_type", "supabase_check")
      .eq("created_at", createdAt);
    if (deleteError) {
      throw new Error(`Supabase cleanup failed: ${deleteError.message}`);
    }
  }

  const temporaryReasonURI = `arcpilot://dispute/supabase-check-${Date.now()}`;
  const { error: disputeInsertError } = await supabase.from("dispute_metadata").insert({
    chain_id: 5042002,
    job_id: 1,
    category: "Supabase check",
    reason: "Temporary ArcPilot service-role dispute metadata write check.",
    reason_uri: temporaryReasonURI,
    raw: { check: "arcpilot-supabase-check" }
  });
  if (disputeInsertError) {
    throw new Error(`Supabase dispute_metadata write test failed: ${disputeInsertError.message}`);
  }

  const { error: disputeDeleteError } = await supabase
    .from("dispute_metadata")
    .delete()
    .eq("reason_uri", temporaryReasonURI);
  if (disputeDeleteError) {
    throw new Error(`Supabase dispute_metadata cleanup failed: ${disputeDeleteError.message}`);
  }
  console.log("ok dispute_metadata service-role insert/delete");

  const temporaryEvidenceURI = `arcpilot://evidence/supabase-check-${Date.now()}`;
  const { error: evidenceInsertError } = await supabase.from("dispute_evidence").insert({
    chain_id: 5042002,
    dispute_id: 1,
    job_id: 1,
    submitted_by_role: "resolver",
    evidence_text: "Temporary ArcPilot service-role evidence write check.",
    evidence_uri: temporaryEvidenceURI,
    raw: { check: "arcpilot-supabase-check" }
  });
  if (evidenceInsertError) throw new Error(`Supabase dispute_evidence write test failed: ${evidenceInsertError.message}`);
  const { error: evidenceDeleteError } = await supabase.from("dispute_evidence").delete().eq("evidence_uri", temporaryEvidenceURI);
  if (evidenceDeleteError) throw new Error(`Supabase dispute_evidence cleanup failed: ${evidenceDeleteError.message}`);
  console.log("ok dispute_evidence service-role insert/delete (including submitted_by_role)");

  const temporaryReviewURI = `arcpilot://ai-dispute-review/supabase-check-${Date.now()}`;
  const { error: aiReviewInsertError } = await supabase.from("ai_dispute_reviews").insert({
    chain_id: 5042002,
    dispute_id: 1,
    job_id: 1,
    recommended_outcome: "manual_review_required",
    confidence: 0,
    agent_bps: 0,
    client_bps: 0,
    slash_amount: "0",
    reasoning: "Temporary ArcPilot service-role AI dispute review write check.",
    evidence_summary: "Temporary check.",
    fairness_notes: "Temporary check.",
    risk_flags: [],
    reviewed_payload: { check: "arcpilot-supabase-check" },
    review_uri: temporaryReviewURI
  });
  if (aiReviewInsertError) throw new Error(`Supabase ai_dispute_reviews write test failed: ${aiReviewInsertError.message}`);
  const { error: aiReviewDeleteError } = await supabase.from("ai_dispute_reviews").delete().eq("review_uri", temporaryReviewURI);
  if (aiReviewDeleteError) throw new Error(`Supabase ai_dispute_reviews cleanup failed: ${aiReviewDeleteError.message}`);
  console.log("ok ai_dispute_reviews service-role insert/delete");

  const temporaryManualReason = `Temporary ArcPilot manual review write check ${Date.now()}.`;
  const { error: manualInsertError } = await supabase.from("manual_review_requests").insert({
    chain_id: 5042002,
    dispute_id: 1,
    job_id: 1,
    reason: temporaryManualReason,
    status: "open"
  });
  if (manualInsertError) throw new Error(`Supabase manual_review_requests write test failed: ${manualInsertError.message}`);
  const { error: manualDeleteError } = await supabase.from("manual_review_requests").delete().eq("reason", temporaryManualReason);
  if (manualDeleteError) throw new Error(`Supabase manual_review_requests cleanup failed: ${manualDeleteError.message}`);
  console.log("ok manual_review_requests service-role insert/delete");

  console.log("Supabase is configured, reachable, and writable.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
