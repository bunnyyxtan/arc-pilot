export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type DeliverableRow = {
  deliverable_hash: string;
  deliverable_uri: string;
  chain_id: number | null;
  job_id: string | null;
  agent_id: string | null;
  agent_name: string;
  agent_category: string;
  job_title: string;
  job_description: string;
  deliverable_type: "research" | "content" | "code" | "general";
  generated_title: string;
  generated_content: string;
  quality_checklist: string[];
  created_by_wallet: string | null;
  tx_hash: string | null;
  visibility: "public" | "restricted";
  client_wallet: string | null;
  agent_owner_wallet: string | null;
  evaluator_wallet: string | null;
  raw: Json | null;
  created_at: string;
};

export type AgentMetadataRow = {
  id?: string;
  chain_id: number;
  owner_wallet: string;
  agent_name: string;
  category: string | null;
  skills: string[];
  operating_wallet: string | null;
  reserve_wallet: string | null;
  metadata: Json;
  metadata_uri: string;
  created_at?: string;
  updated_at?: string;
};

export type IndexedAgentRow = {
  chain_id?: number | null;
  agent_id: string;
  display_id?: string | null;
  owner_wallet?: string | null;
  owner?: string | null;
  name?: string | null;
  category?: string | null;
  skills?: Json;
  metadata_uri?: string | null;
  operating_wallet?: string | null;
  reserve_wallet?: string | null;
  active?: boolean | null;
  access_mode?: string | null;
  trust_bond?: string | null;
  lifetime_earned?: string | null;
  completed_jobs?: string | null;
  disputed_jobs?: string | null;
  avg_score?: string | null;
  reputation_score?: string | null;
  created_at_onchain?: string | null;
  payload: Json;
  raw?: Json;
  updated_at?: string;
};

export type IndexedJobRow = {
  chain_id?: number | null;
  job_id: string;
  agent_id?: string | null;
  client?: string | null;
  status?: string | null;
  status_label?: string | null;
  deliverable_uri?: string | null;
  deliverable_hash?: string | null;
  visibility?: "public" | "restricted" | null;
  payload: Json;
  updated_at?: string;
};

export type IndexedDisputeRow = {
  dispute_id: string;
  job_id?: string | null;
  opened_by?: string | null;
  outcome?: string | null;
  resolved?: boolean | null;
  payload: Json;
  updated_at?: string;
};

export type AppEventRow = {
  id?: string;
  event_key?: string | null;
  event_type: string;
  source: string;
  payload: Json;
  created_at?: string;
};

export type DisputeMetadataRow = {
  id?: string;
  chain_id: number;
  job_id: number | string;
  agent_id?: number | string | null;
  client_wallet?: string | null;
  evaluator_wallet?: string | null;
  category?: string | null;
  reason: string;
  deliverable_uri?: string | null;
  reason_uri: string;
  tx_hash?: string | null;
  raw?: Json;
  created_at?: string;
  updated_at?: string;
};

export type AIDisputeReviewRow = {
  id?: string;
  chain_id: number;
  dispute_id: number | string;
  job_id: number | string;
  agent_id?: number | string | null;
  reviewer_model?: string | null;
  recommended_outcome: "agent_wins" | "client_wins" | "split" | "manual_review_required";
  confidence?: number | null;
  agent_bps?: number | null;
  client_bps?: number | null;
  slash_amount?: string | null;
  reasoning: string;
  evidence_summary?: string | null;
  fairness_notes?: string | null;
  risk_flags?: Json;
  reviewed_payload?: Json;
  review_uri?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ManualReviewRequestRow = {
  id?: string;
  chain_id: number;
  dispute_id: number | string;
  job_id: number | string;
  requested_by_wallet?: string | null;
  reason: string;
  status?: "open" | "accepted" | "resolved" | "rejected";
  created_at?: string;
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
      };
      deliverables: {
        Row: DeliverableRow;
        Insert: DeliverableRow;
        Update: Partial<DeliverableRow>;
      };
      indexed_agents: {
        Row: IndexedAgentRow;
        Insert: IndexedAgentRow;
        Update: Partial<IndexedAgentRow>;
      };
      agent_metadata: {
        Row: AgentMetadataRow;
        Insert: AgentMetadataRow;
        Update: Partial<AgentMetadataRow>;
      };
      indexed_jobs: {
        Row: IndexedJobRow;
        Insert: IndexedJobRow;
        Update: Partial<IndexedJobRow>;
      };
      indexed_disputes: {
        Row: IndexedDisputeRow;
        Insert: IndexedDisputeRow;
        Update: Partial<IndexedDisputeRow>;
      };
      app_events: {
        Row: AppEventRow;
        Insert: AppEventRow;
        Update: Partial<AppEventRow>;
      };
      dispute_metadata: {
        Row: DisputeMetadataRow;
        Insert: DisputeMetadataRow;
        Update: Partial<DisputeMetadataRow>;
      };
      ai_dispute_reviews: {
        Row: AIDisputeReviewRow;
        Insert: AIDisputeReviewRow;
        Update: Partial<AIDisputeReviewRow>;
      };
      manual_review_requests: {
        Row: ManualReviewRequestRow;
        Insert: ManualReviewRequestRow;
        Update: Partial<ManualReviewRequestRow>;
      };
      user_settings: {
        Row: Record<string, Json>;
        Insert: Record<string, Json>;
        Update: Record<string, Json>;
      };
    };
  };
};
