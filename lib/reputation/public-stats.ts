import { shouldCountTowardPublicRatings } from "../jobs/classification";

type AgentLike = {
  agentId?: unknown;
  owner?: unknown;
  stats?: Record<string, unknown>;
  reputationScore?: unknown;
  [key: string]: unknown;
};

type JobLike = {
  agentId?: unknown;
  client?: unknown;
  amount?: unknown;
  status?: unknown;
  createdAt?: unknown;
  fundedAt?: unknown;
  runningAt?: unknown;
  submittedAt?: unknown;
  resolvedAt?: unknown;
  jobClassification?: unknown;
  jobMode?: unknown;
};

const USDC_SCALE = 1_000_000n;
const EARNINGS_CAP = 10_000n * USDC_SCALE;

function asBigInt(value: unknown) {
  try {
    return BigInt(String(value ?? 0));
  } catch {
    return 0n;
  }
}

function publicScore(stats: {
  completedJobs: bigint;
  failedJobs: bigint;
  disputedJobs: bigint;
  lifetimeEarned: bigint;
  lastActiveAt: bigint;
}) {
  const completedBonus = (stats.completedJobs < 50n ? stats.completedJobs : 50n) * 4n;
  const cappedEarnings = stats.lifetimeEarned < EARNINGS_CAP ? stats.lifetimeEarned : EARNINGS_CAP;
  const earningsBonus = cappedEarnings * 150n / EARNINGS_CAP;
  const rawPenalty = (stats.failedJobs + stats.disputedJobs) * 25n;
  const failurePenalty = rawPenalty < 250n ? rawPenalty : 250n;
  const activityBonus = stats.lastActiveAt > 0n ? 50n : 0n;
  const score = 500n + completedBonus + earningsBonus + activityBonus - failurePenalty;
  return score < 0n ? 0n : score > 1000n ? 1000n : score;
}

export function withPublicMarketplaceStats<T extends AgentLike>(agent: T, jobs: JobLike[]) {
  const agentId = String(agent.agentId ?? "");
  const agentJobs = jobs.filter((job) => String(job.agentId ?? "") === agentId);
  const thirdPartyJobs = agentJobs.filter((job) => shouldCountTowardPublicRatings({
    storedClassification: job.jobClassification,
    metadataClassification: job.jobMode,
    client: job.client,
    agentOwner: agent.owner
  }));
  const selfUseJobs = agentJobs.length - thirdPartyJobs.length;
  const completed = thirdPartyJobs.filter((job) => Number(job.status) === 4);
  const failed = thirdPartyJobs.filter((job) => [7, 8].includes(Number(job.status)));
  const disputed = thirdPartyJobs.filter((job) => Number(job.status) === 6);
  const lastActiveAt = thirdPartyJobs.reduce((latest, job) => {
    const timestamps = [job.createdAt, job.fundedAt, job.runningAt, job.submittedAt, job.resolvedAt].map(asBigInt);
    return timestamps.reduce((current, value) => value > current ? value : current, latest);
  }, 0n);
  const publicStats = {
    completedJobs: BigInt(completed.length),
    failedJobs: BigInt(failed.length),
    disputedJobs: BigInt(disputed.length),
    lifetimeEarned: completed.reduce((total, job) => total + asBigInt(job.amount), 0n),
    totalEscrowed: thirdPartyJobs.reduce((total, job) => total + asBigInt(job.amount), 0n),
    totalSlashed: 0n,
    totalToolSpend: 0n,
    lastActiveAt
  };

  return {
    ...agent,
    onchainStats: agent.stats,
    onchainReputationScore: agent.reputationScore,
    stats: publicStats,
    reputationScore: publicScore(publicStats),
    marketplaceStats: {
      selfUseJobs,
      thirdPartyJobs: thirdPartyJobs.length,
      completedClientJobs: completed.length,
      note: "Public marketplace stats exclude self-use jobs. Raw financial accounting remains onchain."
    }
  };
}

export function withPublicMarketplaceAgentList<T extends AgentLike>(agents: T[], jobs: JobLike[]) {
  return agents.map((agent) => withPublicMarketplaceStats(agent, jobs));
}
