import { getSdkContracts, getSigner, type ArcPilotNetwork } from "./arcpilot";
import { loggedOperation } from "../logger";

export async function getTreasuryPolicy(agentId: bigint | number | string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.treasury", "getTreasuryPolicy", { agentId: id, network }, async () => {
    const policy = await getSdkContracts(undefined, network).AgentJobEscrow.getTreasuryPolicy(id);
    return {
      operatingBps: policy.operatingBps,
      reserveBps: policy.reserveBps,
      bondBps: policy.bondBps
    };
  });
}

export async function setTreasuryPolicy(agentId: bigint | number | string, operatingBps: bigint, reserveBps: bigint, bondBps: bigint, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.treasury", "setTreasuryPolicy", { agentId: id, operatingBps, reserveBps, bondBps, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.AgentJobEscrow.setTreasuryPolicy(id, operatingBps, reserveBps, bondBps);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function getTrustBond(agentId: bigint | number | string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.treasury", "getTrustBond", { agentId: id, network }, () =>
    getSdkContracts(undefined, network).TrustBondVault.bondOf(id) as Promise<bigint>
  );
}

export async function depositBond(agentId: bigint | number | string, amount: bigint, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.treasury", "depositBond", { agentId: id, amount, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const approveTx = await contracts.USDC.approve(contracts.deployment.contracts.TrustBondVault, amount);
    await approveTx.wait();
    const depositTx = await contracts.TrustBondVault.depositBond(id, amount);
    await depositTx.wait();
    return { approveTxHash: approveTx.hash, txHash: depositTx.hash };
  });
}

export async function requestBondWithdraw(agentId: bigint | number | string, amount: bigint, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.treasury", "requestBondWithdraw", { agentId: id, amount, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.TrustBondVault.requestWithdraw(id, amount);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function executeBondWithdraw(agentId: bigint | number | string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.treasury", "executeBondWithdraw", { agentId: id, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.TrustBondVault.executeWithdraw(id);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function cancelBondWithdraw(agentId: bigint | number | string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.treasury", "cancelBondWithdraw", { agentId: id, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.TrustBondVault.cancelWithdraw(id);
    await tx.wait();
    return { txHash: tx.hash };
  });
}
