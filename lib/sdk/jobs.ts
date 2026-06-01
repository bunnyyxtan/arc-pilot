import { ZeroAddress } from "ethers";
import { encodeJobURI } from "../contracts/job-uri";
import { loggedOperation } from "../logger";
import { getSdkContracts, getSigner, type ArcPilotNetwork } from "./arcpilot";
import { JOB_STATUS_LABELS, type JobView } from "./types";

export async function getJob(jobId: bigint | number | string, network?: ArcPilotNetwork) {
  const id = BigInt(jobId);
  return loggedOperation("sdk.jobs", "getJob", { jobId: id, network }, () =>
    getSdkContracts(undefined, network).AgentJobEscrow.getJob(id)
  );
}

export async function getJobView(jobId: bigint | number | string, network?: ArcPilotNetwork): Promise<JobView> {
  const id = BigInt(jobId);
  return loggedOperation("sdk.jobs", "getJobView", { jobId: id, network }, async () => {
    const job = await getJob(id, network);
    const status = Number(job.status);
    return {
      jobId: job.jobId,
      agentId: job.agentId,
      client: job.client,
      evaluator: job.evaluator,
      amount: job.amount,
      clientBond: job.clientBond,
      deadline: BigInt(job.deadline),
      jobURI: job.jobURI,
      deliverableURI: job.deliverableURI,
      status,
      statusLabel: JOB_STATUS_LABELS[status] ?? "Unknown",
      createdAt: BigInt(job.createdAt),
      fundedAt: BigInt(job.fundedAt),
      runningAt: BigInt(job.runningAt),
      submittedAt: BigInt(job.submittedAt),
      resolvedAt: BigInt(job.resolvedAt)
    };
  });
}

export async function getTotalJobs(network?: ArcPilotNetwork) {
  return loggedOperation("sdk.jobs", "getTotalJobs", { network }, async () => {
    const nextJobId = await getSdkContracts(undefined, network).AgentJobEscrow.nextJobId();
    return nextJobId - 1n;
  });
}

export async function createJob(
  params: {
    agentId: bigint;
    evaluator?: `0x${string}`;
    amount: bigint;
    clientBond: bigint;
    deadline: bigint;
    jobURI?: string;
    jobTitle?: string;
    jobDescription?: string;
  },
  privateKey: string,
  network?: ArcPilotNetwork
) {
  return loggedOperation("sdk.jobs", "createJob", {
    agentId: params.agentId,
    evaluator: params.evaluator,
    amount: params.amount,
    clientBond: params.clientBond,
    deadline: params.deadline,
    network
  }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const jobURI = params.jobURI ?? encodeJobURI({ title: params.jobTitle ?? "ArcPilot job", description: params.jobDescription ?? "" });
    const tx = await contracts.AgentJobEscrow.createJob(
      params.agentId,
      params.evaluator ?? ZeroAddress,
      params.amount,
      params.clientBond,
      params.deadline,
      jobURI
    );
    const receipt = await tx.wait();
    return { txHash: tx.hash, receipt };
  });
}

export async function fundJob(jobId: bigint | number | string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(jobId);
  return loggedOperation("sdk.jobs", "fundJob", { jobId: id, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const job = await contracts.AgentJobEscrow.getJob(id);
    const total = job.amount + job.clientBond;
    const approveTx = await contracts.USDC.approve(contracts.deployment.contracts.AgentJobEscrow, total);
    await approveTx.wait();
    const fundTx = await contracts.AgentJobEscrow.fundJob(id);
    await fundTx.wait();
    return { approveTxHash: approveTx.hash, txHash: fundTx.hash };
  });
}

export async function markRunning(jobId: bigint | number | string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(jobId);
  return loggedOperation("sdk.jobs", "markRunning", { jobId: id, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.AgentJobEscrow.markRunning(id);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function submitDeliverable(jobId: bigint | number | string, deliverableURI: string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(jobId);
  return loggedOperation("sdk.jobs", "submitDeliverable", { jobId: id, deliverableURI, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.AgentJobEscrow.submitDeliverable(id, deliverableURI);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function approveJob(jobId: bigint | number | string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(jobId);
  return loggedOperation("sdk.jobs", "approveJob", { jobId: id, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.AgentJobEscrow.approveAndRelease(id);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function rejectJob(jobId: bigint | number | string, reasonURI: string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(jobId);
  return loggedOperation("sdk.jobs", "rejectJob", { jobId: id, reasonURI, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.AgentJobEscrow.rejectToDispute(id, reasonURI);
    await tx.wait();
    return { txHash: tx.hash };
  });
}

export async function expireJob(jobId: bigint | number | string, privateKey: string, network?: ArcPilotNetwork) {
  const id = BigInt(jobId);
  return loggedOperation("sdk.jobs", "expireJob", { jobId: id, network }, async () => {
    const contracts = getSdkContracts(getSigner(privateKey, network), network);
    const tx = await contracts.AgentJobEscrow.expireAndRefund(id);
    await tx.wait();
    return { txHash: tx.hash };
  });
}
