import { ethers } from "ethers";
import { getSdkContracts, getSigner, type ArcPilotNetwork } from "./arcpilot";
import { getSpendingPolicy } from "./spending";
import { getTreasuryPolicy, getTrustBond } from "./treasury";
import type { AgentStatsView, AgentView } from "./types";
import { loggedOperation } from "../logger";

export async function getAgent(agentId: bigint | number | string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.agents", "getAgent", { agentId: id, network }, () =>
    getSdkContracts(undefined, network).AgentRegistry.getAgent(id)
  );
}

export async function getAgentStats(agentId: bigint | number | string, network?: ArcPilotNetwork): Promise<AgentStatsView> {
  const id = BigInt(agentId);
  return loggedOperation("sdk.agents", "getAgentStats", { agentId: id, network }, async () => {
    const stats = await getSdkContracts(undefined, network).AgentRegistry.getStats(id);
    return {
      completedJobs: stats.completedJobs,
      failedJobs: stats.failedJobs,
      disputedJobs: stats.disputedJobs,
      lifetimeEarned: stats.lifetimeEarned,
      totalEscrowed: stats.totalEscrowed,
      totalSlashed: stats.totalSlashed,
      totalToolSpend: stats.totalToolSpend,
      lastActiveAt: BigInt(stats.lastActiveAt)
    };
  });
}

export async function getAgentScore(agentId: bigint | number | string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.agents", "getAgentScore", { agentId: id, network }, () =>
    getSdkContracts(undefined, network).AgentRegistry.getReputationScore(id) as Promise<bigint>
  );
}

export async function getAgentView(agentId: bigint | number | string, network?: ArcPilotNetwork): Promise<AgentView> {
  const id = BigInt(agentId);
  return loggedOperation("sdk.agents", "getAgentView", { agentId: id, network }, async () => {
    const [agent, stats, reputationScore, trustBond, treasuryPolicy, spendingPolicy] = await Promise.all([
      getAgent(id, network),
      getAgentStats(id, network),
      getAgentScore(id, network),
      getTrustBond(id, network),
      getTreasuryPolicy(id, network),
      getSpendingPolicy(id, network)
    ]);

    return {
      agentId: agent.agentId,
      owner: agent.owner,
      name: agent.name,
      category: agent.category,
      metadataURI: agent.metadataURI,
      skillsHash: agent.skillsHash,
      operatingWallet: agent.operatingWallet,
      reserveWallet: agent.reserveWallet,
      active: agent.active,
      createdAt: BigInt(agent.createdAt),
      stats,
      reputationScore,
      trustBond,
      treasuryPolicy,
      spendingPolicy
    };
  });
}

export async function registerAgent(
  params: {
    name: string;
    category: string;
    metadataURI: string;
    skills?: string;
    skillsHash?: `0x${string}`;
    operatingWallet: `0x${string}`;
    reserveWallet: `0x${string}`;
  },
  privateKey: string,
  network?: ArcPilotNetwork
) {
  return loggedOperation("sdk.agents", "registerAgent", {
    name: params.name,
    category: params.category,
    operatingWallet: params.operatingWallet,
    reserveWallet: params.reserveWallet,
    network
  }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const skillsHash = params.skillsHash ?? (ethers.keccak256(ethers.toUtf8Bytes(params.skills ?? "")) as `0x${string}`);
    const tx = await contracts.AgentRegistry.registerAgent(
      params.name,
      params.category,
      params.metadataURI,
      skillsHash,
      params.operatingWallet,
      params.reserveWallet
    );
    const receipt = await tx.wait();
    return { txHash: tx.hash, receipt };
  });
}

export async function deactivateAgent(agentId: bigint | number | string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.agents", "deactivateAgent", { agentId: id, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.AgentRegistry.deactivateAgent(id);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function getTotalAgents(network?: ArcPilotNetwork) {
  return loggedOperation("sdk.agents", "getTotalAgents", { network }, async () => {
    const nextAgentId = await getSdkContracts(undefined, network).AgentRegistry.nextAgentId();
    return nextAgentId - 1n;
  });
}
