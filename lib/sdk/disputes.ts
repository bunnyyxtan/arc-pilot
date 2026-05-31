import { getSdkContracts, getSigner, type ArcPilotNetwork } from "./arcpilot";
import type { DisputeView } from "./types";
import { loggedOperation } from "../logger";

export async function getDispute(disputeId: bigint | number | string, network?: ArcPilotNetwork): Promise<DisputeView> {
  const id = BigInt(disputeId);
  return loggedOperation("sdk.disputes", "getDispute", { disputeId: id, network }, async () => {
    const dispute = await getSdkContracts(undefined, network).DisputeManager.getDispute(id);
    return {
      disputeId: dispute.disputeId,
      jobId: dispute.jobId,
      openedBy: dispute.openedBy,
      reasonURI: dispute.reasonURI,
      evidenceURI: dispute.evidenceURI,
      outcome: Number(dispute.outcome),
      resolved: dispute.resolved,
      createdAt: BigInt(dispute.createdAt),
      resolvedAt: BigInt(dispute.resolvedAt)
    };
  });
}

export async function getTotalDisputes(network?: ArcPilotNetwork) {
  return loggedOperation("sdk.disputes", "getTotalDisputes", { network }, async () => {
    const nextDisputeId = await getSdkContracts(undefined, network).DisputeManager.nextDisputeId();
    return nextDisputeId - 1n;
  });
}

export async function submitEvidence(disputeId: bigint | number | string, evidenceURI: string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(disputeId);
  return loggedOperation("sdk.disputes", "submitEvidence", { disputeId: id, evidenceURI, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.DisputeManager.submitEvidence(id, evidenceURI);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function resolveAgentWins(disputeId: bigint | number | string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(disputeId);
  return loggedOperation("sdk.disputes", "resolveAgentWins", { disputeId: id, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.DisputeManager.resolveAgentWins(id);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function resolveClientWins(disputeId: bigint | number | string, slashAmount: bigint, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(disputeId);
  return loggedOperation("sdk.disputes", "resolveClientWins", { disputeId: id, slashAmount, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.DisputeManager.resolveClientWins(id, slashAmount);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function resolveSplit(disputeId: bigint | number | string, agentBps: bigint, clientBps: bigint, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(disputeId);
  return loggedOperation("sdk.disputes", "resolveSplit", { disputeId: id, agentBps, clientBps, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.DisputeManager.resolveSplit(id, agentBps, clientBps);
    await tx.wait();
    return { txHash: tx.hash };
  });
}
