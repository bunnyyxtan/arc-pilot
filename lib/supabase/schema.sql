-- ArcPilot Supabase schema notes.
-- Run these statements in Supabase SQL editor when enabling persistence.

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

alter table deliverables
  add column if not exists visibility text default 'restricted',
  add column if not exists client_wallet text,
  add column if not exists agent_owner_wallet text,
  add column if not exists evaluator_wallet text;

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
  reviewed_payload jsonb default '{}'::jsonb,
  review_uri text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_dispute_reviews_dispute_id on ai_dispute_reviews(dispute_id);
create index if not exists idx_ai_dispute_reviews_job_id on ai_dispute_reviews(job_id);
create index if not exists idx_ai_dispute_reviews_agent_id on ai_dispute_reviews(agent_id);
create index if not exists idx_ai_dispute_reviews_recommended_outcome on ai_dispute_reviews(recommended_outcome);
create index if not exists idx_ai_dispute_reviews_chain_id on ai_dispute_reviews(chain_id);

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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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
