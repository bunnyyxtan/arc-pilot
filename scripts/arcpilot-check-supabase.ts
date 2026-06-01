import { loadEnvFiles } from "../lib/contracts/runtime";
import { insertAppEvent } from "../lib/supabase/indexed-data";
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
    .select("chain_id,agent_id,display_id,owner_wallet,owner,name,category,skills,metadata_uri,operating_wallet,reserve_wallet,active,access_mode,trust_bond,lifetime_earned,completed_jobs,disputed_jobs,avg_score,reputation_score,created_at_onchain,raw,updated_at")
    .limit(1);
  if (indexedAgentColumnsError) {
    throw new Error(`Supabase indexed_agents migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${indexedAgentColumnsError.message}`);
  }
  console.log("ok indexed_agents raw canonical columns");

  const { error: indexedJobColumnsError } = await supabase
    .from("indexed_jobs")
    .select("chain_id,job_id,agent_id,client,status,status_label,deliverable_uri,deliverable_hash,visibility,payload,updated_at")
    .limit(1);
  if (indexedJobColumnsError) {
    throw new Error(`Supabase indexed_jobs migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${indexedJobColumnsError.message}`);
  }
  console.log("ok indexed_jobs sync columns");

  const { error: indexedDisputeColumnsError } = await supabase
    .from("indexed_disputes")
    .select("dispute_id,job_id,opened_by,outcome,resolved,payload,updated_at")
    .limit(1);
  if (indexedDisputeColumnsError) {
    throw new Error(`Supabase indexed_disputes migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${indexedDisputeColumnsError.message}`);
  }
  console.log("ok indexed_disputes onchain-state columns");

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
    .select("deliverable_hash,deliverable_uri,chain_id,job_id,agent_id,agent_name,agent_category,job_title,job_description,deliverable_type,generated_title,generated_content,quality_checklist,created_by_wallet,tx_hash,visibility,client_wallet,agent_owner_wallet,evaluator_wallet,raw,created_at")
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

  const { error: disputeEvidenceColumnsError } = await supabase
    .from("dispute_evidence")
    .select("submitted_by_role")
    .limit(1);
  if (disputeEvidenceColumnsError) {
    throw new Error(`Supabase dispute_evidence migration is incomplete. Apply lib/supabase/schema.sql in the Supabase SQL editor. Details: ${disputeEvidenceColumnsError.message}`);
  }
  console.log("ok dispute_evidence submitted_by_role column");

  const createdAt = new Date().toISOString();
  const eventKey = `supabase_check:${createdAt}`;
  const eventWrite = await insertAppEvent({
    event_type: "supabase_check",
    source: "script",
    payload: { check: "arcpilot-supabase-check" },
    event_key: eventKey
  });
  if (!eventWrite.ok || eventWrite.reason) {
    throw new Error(`Supabase app_events modern write test failed: ${eventWrite.reason || "unknown error"}`);
  }
  const repeatEventWrite = await insertAppEvent({
    event_type: "supabase_check",
    source: "script",
    payload: { check: "arcpilot-supabase-check-repeat" },
    event_key: eventKey
  });
  if (!repeatEventWrite.ok || repeatEventWrite.reason) {
    throw new Error(`Supabase app_events idempotent update test failed: ${repeatEventWrite.reason || "unknown error"}`);
  }
  const { count: eventCount, error: eventCountError } = await supabase
    .from("app_events")
    .select("*", { count: "exact", head: true })
    .eq("event_key", eventKey);
  if (eventCountError || eventCount !== 1) {
    throw new Error(`Supabase app_events idempotent write verification failed: ${eventCountError?.message || `expected 1 row, found ${eventCount ?? 0}`}`);
  }
  const { error: deleteError } = await supabase.from("app_events").delete().eq("event_key", eventKey);
  if (deleteError) {
    throw new Error(`Supabase app_events cleanup failed: ${deleteError.message}`);
  }
  console.log("ok app_events modern idempotent insert/update/delete");

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
