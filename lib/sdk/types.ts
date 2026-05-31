export type HexAddress = `0x${string}`;

export type AgentStatsView = {
  completedJobs: bigint;
  failedJobs: bigint;
  disputedJobs: bigint;
  lifetimeEarned: bigint;
  totalEscrowed: bigint;
  totalSlashed: bigint;
  totalToolSpend: bigint;
  lastActiveAt: bigint;
};

export type TreasuryPolicyView = {
  operatingBps: bigint;
  reserveBps: bigint;
  bondBps: bigint;
};

export type SpendingPolicyView = {
  maxSpendPerJob: bigint;
  dailySpendLimit: bigint;
  allowData: boolean;
  allowApi: boolean;
  allowCompute: boolean;
  allowOtherAgents: boolean;
  active: boolean;
};

export type AgentView = {
  agentId: bigint;
  owner: HexAddress;
  name: string;
  category: string;
  metadataURI: string;
  skillsHash: HexAddress;
  operatingWallet: HexAddress;
  reserveWallet: HexAddress;
  active: boolean;
  createdAt: bigint;
  stats: AgentStatsView;
  reputationScore: bigint;
  trustBond: bigint;
  treasuryPolicy: TreasuryPolicyView;
  spendingPolicy: SpendingPolicyView;
};

export type JobView = {
  jobId: bigint;
  agentId: bigint;
  client: HexAddress;
  evaluator: HexAddress;
  amount: bigint;
  clientBond: bigint;
  deadline: bigint;
  jobURI: string;
  deliverableURI: string;
  status: number;
  statusLabel: string;
  createdAt: bigint;
  fundedAt: bigint;
  runningAt: bigint;
  submittedAt: bigint;
  resolvedAt: bigint;
};

export type DisputeView = {
  disputeId: bigint;
  jobId: bigint;
  openedBy: HexAddress;
  reasonURI: string;
  evidenceURI: string;
  outcome: number;
  resolved: boolean;
  createdAt: bigint;
  resolvedAt: bigint;
};

export type ClientStatsView = {
  jobsCreated: bigint;
  jobsApproved: bigint;
  jobsRejected: bigint;
  disputesLost: bigint;
  disputesWon: bigint;
  totalPaid: bigint;
  totalRefunded: bigint;
  totalBondSlashed: bigint;
};

export const JOB_STATUS_LABELS = [
  "Open",
  "Funded",
  "Running",
  "Submitted",
  "Completed",
  "Rejected",
  "Disputed",
  "Expired",
  "Refunded"
] as const;

export function bigintJson(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested))
  ) as unknown;
}
