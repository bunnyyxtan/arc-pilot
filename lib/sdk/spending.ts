import { getSdkContracts, getSigner, type ArcPilotNetwork } from "./arcpilot";
import { loggedOperation } from "../logger";

export type SpendingPolicyInput = {
  maxSpendPerJob: bigint;
  dailySpendLimit: bigint;
  allowData: boolean;
  allowApi: boolean;
  allowCompute: boolean;
  allowOtherAgents: boolean;
};

export async function getSpendingPolicy(agentId: bigint | number | string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.spending", "getPolicy", { agentId: id, network }, async () => {
    const policy = await getSdkContracts(undefined, network).SpendingPolicyManager.getPolicy(id);
    return {
      maxSpendPerJob: policy.maxSpendPerJob,
      dailySpendLimit: policy.dailySpendLimit,
      allowData: policy.allowData,
      allowApi: policy.allowApi,
      allowCompute: policy.allowCompute,
      allowOtherAgents: policy.allowOtherAgents,
      active: policy.active
    };
  });
}

export async function setSpendingPolicy(agentId: bigint | number | string, policy: SpendingPolicyInput, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(agentId);
  return loggedOperation("sdk.spending", "setPolicy", { agentId: id, policy, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.SpendingPolicyManager.setPolicy(
      id,
      policy.maxSpendPerJob,
      policy.dailySpendLimit,
      policy.allowData,
      policy.allowApi,
      policy.allowCompute,
      policy.allowOtherAgents
    );
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function logExpense(params: { jobId: bigint; agentId: bigint; amount: bigint; expenseType: number; note: string }, privateKey: string, network?: ArcPilotNetwork) {
  return loggedOperation("sdk.spending", "logExpense", {
    jobId: params.jobId,
    agentId: params.agentId,
    amount: params.amount,
    expenseType: params.expenseType,
    network
  }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.SpendingPolicyManager.logExpense(params.jobId, params.agentId, params.amount, params.expenseType, params.note);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function getJobSpend(jobId: bigint | number | string, network?: ArcPilotNetwork) {
  const id = BigInt(jobId);
  return loggedOperation("sdk.spending", "getJobSpend", { jobId: id, network }, () =>
    getSdkContracts(undefined, network).SpendingPolicyManager.getJobSpend(id) as Promise<bigint>
  );
}

export async function getExpense(expenseId: bigint | number | string, network?: ArcPilotNetwork) {
  const id = BigInt(expenseId);
  return loggedOperation("sdk.spending", "getExpense", { expenseId: id, network }, () =>
    getSdkContracts(undefined, network).SpendingPolicyManager.getExpense(id)
  );
}
