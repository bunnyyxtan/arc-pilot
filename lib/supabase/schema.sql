-- ArcPilot Supabase schema notes.
-- Run these statements in Supabase SQL editor when enabling persistence.

create table if not exists deliverables (
  deliverable_hash text primary key,
  deliverable_uri text unique not null,
  chain_id numeric not null default 5042002,
  job_id numeric,
  agent_id numeric,
  agent_name text not null,
  agent_category text not null,
  job_title text not null,
  job_description text not null,
  deliverable_type text not null,
  generated_title text not null,
  generated_content text not null,
  quality_checklist jsonb default '[]'::jsonb,
  created_by_wallet text,
  tx_hash text,
  visibility text default 'restricted',
  client_wallet text,
  agent_owner_wallet text,
  evaluator_wallet text,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists indexed_agents (
  chain_id numeric default 5042002,
  agent_id numeric primary key,
  display_id text,
  owner_wallet text,
  owner text,
  name text,
  category text,
  skills jsonb default '[]'::jsonb,
  metadata_uri text,
  operating_wallet text,
  reserve_wallet text,
  active boolean,
  access_mode text default 'public',
  trust_bond numeric default 0,
  lifetime_earned numeric default 0,
  completed_jobs numeric default 0,
  disputed_jobs numeric default 0,
  avg_score numeric default 0,
  reputation_score numeric default 0,
  created_at_onchain numeric,
  raw jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table indexed_agents
  add column if not exists chain_id numeric default 5042002,
  add column if not exists display_id text,
  add column if not exists owner_wallet text,
  add column if not exists skills jsonb default '[]'::jsonb,
  add column if not exists metadata_uri text,
  add column if not exists operating_wallet text,
  add column if not exists reserve_wallet text,
  add column if not exists access_mode text default 'public',
  add column if not exists trust_bond numeric default 0,
  add column if not exists lifetime_earned numeric default 0,
  add column if not exists completed_jobs numeric default 0,
  add column if not exists disputed_jobs numeric default 0,
  add column if not exists avg_score numeric default 0,
  add column if not exists reputation_score numeric default 0,
  add column if not exists created_at_onchain numeric,
  add column if not exists raw jsonb default '{}'::jsonb;

create index if not exists indexed_agents_chain_id_idx on indexed_agents(chain_id);
create index if not exists indexed_agents_owner_wallet_idx on indexed_agents(owner_wallet);

create table if not exists indexed_jobs (
  chain_id numeric default 5042002,
  job_id numeric primary key,
  agent_id numeric,
  client text,
  status text,
  status_label text,
  deliverable_uri text,
  deliverable_hash text,
  visibility text default 'restricted',
  job_classification text default 'marketplace',
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table indexed_jobs
  add column if not exists chain_id numeric default 5042002,
  add column if not exists agent_id numeric,
  add column if not exists client text,
  add column if not exists status text,
  add column if not exists status_label text,
  add column if not exists deliverable_uri text,
  add column if not exists deliverable_hash text,
  add column if not exists visibility text default 'restricted',
  add column if not exists job_classification text default 'marketplace',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

create index if not exists indexed_jobs_chain_id_idx on indexed_jobs(chain_id);
create index if not exists indexed_jobs_agent_id_idx on indexed_jobs(agent_id);
create index if not exists indexed_jobs_client_idx on indexed_jobs(client);
create index if not exists indexed_jobs_job_classification_idx on indexed_jobs(job_classification);

update indexed_jobs
set job_classification = 'marketplace'
where job_classification is null;

create table if not exists indexed_disputes (
  dispute_id numeric primary key,
  job_id numeric,
  opened_by text,
  outcome text,
  resolved boolean default false,
  payload jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table indexed_disputes
  add column if not exists job_id numeric,
  add column if not exists opened_by text,
  add column if not exists outcome text,
  add column if not exists resolved boolean default false,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

create index if not exists indexed_disputes_job_id_idx on indexed_disputes(job_id);

create table if not exists app_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  source text,
  payload jsonb default '{}'::jsonb,
  event_key text,
  created_at timestamptz default now()
);

alter table app_events
  add column if not exists source text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists event_key text;

drop index if exists app_events_event_key_idx;
create unique index app_events_event_key_idx on app_events(event_key);

create table if not exists agent_metadata (
  id uuid primary key default gen_random_uuid(),
  chain_id numeric default 5042002,
  owner_wallet text not null,
  agent_name text not null,
  category text,
  skills jsonb default '[]'::jsonb,
  operating_wallet text,
  reserve_wallet text,
  metadata jsonb default '{}'::jsonb,
  metadata_uri text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists agent_metadata_owner_wallet_idx on agent_metadata (owner_wallet);
create index if not exists agent_metadata_metadata_uri_idx on agent_metadata (metadata_uri);
create index if not exists agent_metadata_chain_id_idx on agent_metadata (chain_id);
create index if not exists agent_metadata_agent_name_idx on agent_metadata (agent_name);

create table if not exists job_scope_checks (
  id uuid primary key default gen_random_uuid(),
  chain_id numeric default 5042002,
  job_id numeric,
  agent_id numeric not null,
  client_wallet text,
  job_title text not null,
  job_description text not null,
  agent_category text not null,
  agent_skills jsonb default '[]'::jsonb,
  in_scope boolean not null,
  scope_confidence text not null,
  scope_reason text not null,
  matched_skills jsonb default '[]'::jsonb,
  missing_capabilities jsonb default '[]'::jsonb,
  decision text not null,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_job_scope_checks_job_id on job_scope_checks(job_id);
create index if not exists idx_job_scope_checks_agent_id on job_scope_checks(agent_id);
create index if not exists idx_job_scope_checks_client_wallet on job_scope_checks(client_wallet);
create index if not exists idx_job_scope_checks_chain_id on job_scope_checks(chain_id);

alter table job_scope_checks enable row level security;

create table if not exists agent_reviews (
  id uuid primary key default gen_random_uuid(),
  chain_id numeric default 5042002,
  agent_id numeric not null,
  job_id numeric not null,
  client_wallet text not null,
  rating numeric not null check (rating between 1 and 5),
  review_text text,
  tags jsonb default '[]'::jsonb,
  review_context text default 'approval',
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table agent_reviews
  add column if not exists review_context text default 'approval';

create unique index if not exists idx_agent_reviews_job_client on agent_reviews(chain_id, job_id, client_wallet);
create index if not exists idx_agent_reviews_agent_id on agent_reviews(agent_id);
create index if not exists idx_agent_reviews_client_wallet on agent_reviews(client_wallet);
create index if not exists idx_agent_reviews_chain_id on agent_reviews(chain_id);

alter table agent_reviews enable row level security;

drop policy if exists "agent_reviews_public_read" on agent_reviews;
create policy "agent_reviews_public_read"
on agent_reviews
for select
using (true);

create table if not exists job_regenerations (
  id uuid primary key default gen_random_uuid(),
  chain_id numeric default 5042002,
  job_id numeric not null,
  agent_id numeric,
  requested_by_wallet text,
  attempt_number numeric not null,
  deliverable_hash text,
  deliverable_uri text,
  created_at timestamptz default now(),
  raw jsonb default '{}'::jsonb
);

create unique index if not exists idx_job_regenerations_job_attempt on job_regenerations(chain_id, job_id, attempt_number);
create index if not exists idx_job_regenerations_job_id on job_regenerations(job_id);
create index if not exists idx_job_regenerations_agent_id on job_regenerations(agent_id);
create index if not exists idx_job_regenerations_requested_by_wallet on job_regenerations(requested_by_wallet);
create index if not exists idx_job_regenerations_chain_id on job_regenerations(chain_id);

alter table job_regenerations enable row level security;

alter table deliverables
  add column if not exists chain_id numeric default 5042002,
  add column if not exists visibility text default 'restricted',
  add column if not exists client_wallet text,
  add column if not exists agent_owner_wallet text,
  add column if not exists evaluator_wallet text;

update deliverables set chain_id = 5042002 where chain_id is null;

alter table deliverables
  alter column chain_id set default 5042002,
  alter column chain_id set not null;

create index if not exists deliverables_visibility_idx on deliverables (visibility);
create index if not exists deliverables_client_wallet_idx on deliverables (client_wallet);
create index if not exists deliverables_agent_owner_wallet_idx on deliverables (agent_owner_wallet);
create index if not exists deliverables_evaluator_wallet_idx on deliverables (evaluator_wallet);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deliverables_visibility_check'
  ) then
    alter table deliverables
      add constraint deliverables_visibility_check
      check (visibility in ('public', 'restricted'));
  end if;
end $$;

create table if not exists dispute_metadata (
  id uuid primary key default gen_random_uuid(),
  chain_id numeric default 5042002,
  job_id numeric not null,
  agent_id numeric,
  client_wallet text,
  evaluator_wallet text,
  category text,
  reason text not null,
  deliverable_uri text,
  reason_uri text unique not null,
  tx_hash text,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_dispute_metadata_job_id on dispute_metadata(job_id);
create index if not exists idx_dispute_metadata_client_wallet on dispute_metadata(client_wallet);
create index if not exists idx_dispute_metadata_reason_uri on dispute_metadata(reason_uri);
create index if not exists idx_dispute_metadata_chain_id on dispute_metadata(chain_id);

alter table dispute_metadata enable row level security;

drop policy if exists "dispute_metadata_public_read" on dispute_metadata;
create policy "dispute_metadata_public_read"
on dispute_metadata
for select
using (true);

create table if not exists dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  chain_id numeric default 5042002,
  dispute_id numeric not null,
  job_id numeric not null,
  submitted_by_wallet text,
  submitted_by_role text,
  evidence_text text not null,
  supporting_link text,
  evidence_uri text unique not null,
  tx_hash text,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_dispute_evidence_dispute_id on dispute_evidence(dispute_id);
create index if not exists idx_dispute_evidence_job_id on dispute_evidence(job_id);
create index if not exists idx_dispute_evidence_submitted_by_wallet on dispute_evidence(submitted_by_wallet);
create index if not exists idx_dispute_evidence_evidence_uri on dispute_evidence(evidence_uri);
create index if not exists idx_dispute_evidence_chain_id on dispute_evidence(chain_id);

alter table dispute_evidence
  add column if not exists submitted_by_role text;

alter table dispute_evidence enable row level security;

drop policy if exists "dispute_evidence_public_read" on dispute_evidence;
create policy "dispute_evidence_public_read"
on dispute_evidence
for select
using (true);

create table if not exists ai_dispute_reviews (
  id uuid primary key default gen_random_uuid(),
  chain_id numeric default 5042002,
  dispute_id numeric not null,
  job_id numeric not null,
  agent_id numeric,
  reviewer_model text,
  recommended_outcome text not null,
  confidence numeric,
  agent_bps numeric,
  client_bps numeric,
  slash_amount text,
  reasoning text not null,
  evidence_summary text,
  fairness_notes text,
  risk_flags jsonb default '[]'::jsonb,
  rubric_scores jsonb default '{}'::jsonb,
  reviewed_payload jsonb default '{}'::jsonb,
  review_uri text unique,
  review_round numeric default 1,
  parent_review_id uuid,
  is_active boolean default true,
  model_recommendation text,
  guarded_recommendation text,
  evidence_considered boolean default false,
  client_claim_strength text,
  agent_deliverable_strength text,
  scope_assessment text,
  bad_faith_risk text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table ai_dispute_reviews
  add column if not exists rubric_scores jsonb default '{}'::jsonb,
  add column if not exists review_round numeric default 1,
  add column if not exists parent_review_id uuid,
  add column if not exists is_active boolean default true,
  add column if not exists model_recommendation text,
  add column if not exists guarded_recommendation text,
  add column if not exists evidence_considered boolean default false,
  add column if not exists client_claim_strength text,
  add column if not exists agent_deliverable_strength text,
  add column if not exists scope_assessment text,
  add column if not exists bad_faith_risk text;

alter table ai_dispute_reviews
  drop constraint if exists ai_dispute_reviews_outcome_check;

alter table ai_dispute_reviews
  add constraint ai_dispute_reviews_outcome_check
  check (recommended_outcome in ('agent_wins', 'client_wins', 'split', 'needs_admin_review', 'manual_review_required'));

create index if not exists idx_ai_dispute_reviews_dispute_id on ai_dispute_reviews(dispute_id);
create index if not exists idx_ai_dispute_reviews_job_id on ai_dispute_reviews(job_id);
create index if not exists idx_ai_dispute_reviews_agent_id on ai_dispute_reviews(agent_id);
create index if not exists idx_ai_dispute_reviews_recommended_outcome on ai_dispute_reviews(recommended_outcome);
create index if not exists idx_ai_dispute_reviews_chain_id on ai_dispute_reviews(chain_id);
create index if not exists idx_ai_dispute_reviews_review_round on ai_dispute_reviews(dispute_id, review_round);

alter table ai_dispute_reviews enable row level security;

drop policy if exists "ai_dispute_reviews_public_read" on ai_dispute_reviews;
create policy "ai_dispute_reviews_public_read"
on ai_dispute_reviews
for select
using (true);

create table if not exists manual_review_requests (
  id uuid primary key default gen_random_uuid(),
  chain_id numeric default 5042002,
  dispute_id numeric not null,
  job_id numeric not null,
  requested_by_wallet text,
  reason text not null,
  status text default 'open',
  reviewed_by_wallet text,
  resolver_note text,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table manual_review_requests
  add column if not exists reviewed_by_wallet text,
  add column if not exists resolver_note text,
  add column if not exists resolved_at timestamptz;

create index if not exists idx_manual_review_requests_dispute_id on manual_review_requests(dispute_id);
create index if not exists idx_manual_review_requests_job_id on manual_review_requests(job_id);
create index if not exists idx_manual_review_requests_requested_by_wallet on manual_review_requests(requested_by_wallet);
create index if not exists idx_manual_review_requests_status on manual_review_requests(status);
create index if not exists idx_manual_review_requests_chain_id on manual_review_requests(chain_id);

alter table manual_review_requests enable row level security;

drop policy if exists "manual_review_requests_public_read" on manual_review_requests;
create policy "manual_review_requests_public_read"
on manual_review_requests
for select
using (true);
