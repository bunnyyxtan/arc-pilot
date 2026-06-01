import type { PublicClient } from "viem";
import { agentJobEscrowAbi, agentRegistryAbi, disputeManagerAbi, spendingPolicyManagerAbi, trustBondVaultAbi } from "./browser-abis";
import type { BrowserContractAddresses } from "./browser-addresses";
import { normalizeJobClassification, type JobClassification } from "../jobs/classification";
import { getJobStatusLabel, normalizeJobStatus } from "../jobs/status";

export async function readAgentView(client: PublicClient, addresses: BrowserContractAddresses, agentId: bigint) {
  const [profile, stats, reputationScore, trustBond, treasuryPolicy, spendingPolicy] = await Promise.all([
    client.readContract({ address: addresses.AgentRegistry, abi: agentRegistryAbi, functionName: "getAgent", args: [agentId] }),
    client.readContract({ address: addresses.AgentRegistry, abi: agentRegistryAbi, functionName: "getStats", args: [agentId] }),
    client.readContract({ address: addresses.AgentRegistry, abi: agentRegistryAbi, functionName: "getReputationScore", args: [agentId] }),
    client.readContract({ address: addresses.TrustBondVault, abi: trustBondVaultAbi, functionName: "bondOf", args: [agentId] }),
    client.readContract({ address: addresses.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "getTreasuryPolicy", args: [agentId] }),
    client.readContract({ address: addresses.SpendingPolicyManager, abi: spendingPolicyManagerAbi, functionName: "getPolicy", args: [agentId] })
  ]) as [any, any, bigint, bigint, any, any];
  return { ...profile, stats, reputationScore, trustBond, treasuryPolicy, spendingPolicy };
}

export async function readAgents(client: PublicClient, addresses: BrowserContractAddresses) {
  const next = await client.readContract({ address: addresses.AgentRegistry, abi: agentRegistryAbi, functionName: "nextAgentId" });
  const ids = Array.from({ length: Math.max(0, Number(next) - 1) }, (_, index) => BigInt(index + 1));
  return Promise.all(ids.map((id) => readAgentView(client, addresses, id)));
}

export async function readJobView(client: PublicClient, addresses: BrowserContractAddresses, jobId: bigint) {
  const job = await client.readContract({ address: addresses.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "getJob", args: [jobId] }) as any;
  const decoded = decodeBrowserJobURI(job.jobURI);
  return {
    ...job,
    status: normalizeJobStatus(job.status) ?? Number(job.status),
    statusLabel: getJobStatusLabel(job.status),
    ...(decoded?.jobClassification ? { jobClassification: decoded.jobClassification } : {})
  };
}

export async function readJobs(client: PublicClient, addresses: BrowserContractAddresses) {
  const next = await client.readContract({ address: addresses.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "nextJobId" });
  const ids = Array.from({ length: Math.max(0, Number(next) - 1) }, (_, index) => BigInt(index + 1));
  return Promise.all(ids.map((id) => readJobView(client, addresses, id)));
}

export async function readDisputeView(client: PublicClient, addresses: BrowserContractAddresses, disputeId: bigint): Promise<any> {
  return client.readContract({ address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "getDispute", args: [disputeId] }) as Promise<any>;
}

export async function readDisputes(client: PublicClient, addresses: BrowserContractAddresses) {
  const next = await client.readContract({ address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "nextDisputeId" });
  const ids = Array.from({ length: Math.max(0, Number(next) - 1) }, (_, index) => BigInt(index + 1));
  return Promise.all(ids.map((id) => readDisputeView(client, addresses, id)));
}

export function decodeBrowserJobURI(jobURI: string): { title: string; description: string; deliverableVisibility?: "public" | "restricted"; jobClassification?: JobClassification; jobMode?: JobClassification; scopeCheckId?: string; scopeDecision?: "allow" | "warn" | "block" | "override_accepted" } | null {
  if (!jobURI.startsWith("arcpilot-job://")) return null;
  try {
    const encoded = jobURI.slice("arcpilot-job://".length).replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { title?: unknown; description?: unknown; deliverableVisibility?: unknown; jobClassification?: unknown; jobMode?: unknown; scopeCheckId?: unknown; scopeDecision?: unknown };
    if (typeof parsed.title !== "string" || typeof parsed.description !== "string") return null;
    const jobClassification = normalizeJobClassification(parsed.jobClassification ?? parsed.jobMode) ?? undefined;
    return {
      title: parsed.title,
      description: parsed.description,
      deliverableVisibility: parsed.deliverableVisibility === "public" ? "public" : parsed.deliverableVisibility === "restricted" ? "restricted" : undefined,
      jobClassification,
      jobMode: jobClassification,
      scopeCheckId: typeof parsed.scopeCheckId === "string" ? parsed.scopeCheckId : undefined,
      scopeDecision: parsed.scopeDecision === "allow" || parsed.scopeDecision === "warn" || parsed.scopeDecision === "block" || parsed.scopeDecision === "override_accepted" ? parsed.scopeDecision : undefined
    };
  } catch {
    return null;
  }
}
