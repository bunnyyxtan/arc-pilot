import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { ethers } from "ethers";
import type { Address, WalletClient } from "viem";

const USDC = (value: string) => ethers.parseUnits(value, 6);
const { viem, networkHelpers } = await network.create();

type CallerName = "Agent Owner" | "Client" | "Evaluator" | "Random Wallet" | "Resolver" | "Admin";
type Result = { allowed: boolean; reason: string };

const callers: CallerName[] = ["Agent Owner", "Client", "Evaluator", "Random Wallet", "Resolver", "Admin"];

function revertReason(error: unknown) {
  let current = error as { shortMessage?: unknown; details?: unknown; message?: unknown; cause?: unknown } | undefined;
  const messages: string[] = [];
  while (current && typeof current === "object") {
    for (const value of [current.shortMessage, current.details, current.message]) {
      if (typeof value === "string" && value.trim()) messages.push(value.trim());
    }
    current = current.cause as typeof current;
  }
  const useful = messages.find((message) => /revert|not |only|unauthorized|denied/i.test(message));
  return (useful || messages[0] || "reverted").replace(/\s+/g, " ");
}

async function attempt(action: () => Promise<unknown>): Promise<Result> {
  try {
    await action();
    return { allowed: true, reason: "allowed" };
  } catch (error) {
    return { allowed: false, reason: revertReason(error) };
  }
}

async function deployFixture() {
  const [deployer, client, agentOwner, evaluator, randomWallet, resolver, operatingWallet, reserveWallet] =
    await viem.getWalletClients();

  const mockUSDC = await viem.deployContract("MockUSDC");
  const agentRegistry = await viem.deployContract("AgentRegistry");
  const clientRegistry = await viem.deployContract("ClientRegistry");
  const trustBondVault = await viem.deployContract("TrustBondVault", [mockUSDC.address, agentRegistry.address]);
  const spendingPolicyManager = await viem.deployContract("SpendingPolicyManager", [agentRegistry.address]);
  const agentJobEscrow = await viem.deployContract("AgentJobEscrow", [
    mockUSDC.address,
    agentRegistry.address,
    clientRegistry.address,
    trustBondVault.address
  ]);
  const disputeManager = await viem.deployContract("DisputeManager", [
    agentJobEscrow.address,
    agentRegistry.address,
    clientRegistry.address,
    trustBondVault.address
  ]);

  await agentRegistry.write.setAuthorizedUpdater([agentJobEscrow.address, true]);
  await agentRegistry.write.setAuthorizedUpdater([spendingPolicyManager.address, true]);
  await clientRegistry.write.setAuthorizedUpdater([agentJobEscrow.address, true]);
  await clientRegistry.write.setAuthorizedUpdater([disputeManager.address, true]);
  await trustBondVault.write.setAuthorizedOperator([agentJobEscrow.address, true]);
  await trustBondVault.write.setAuthorizedOperator([disputeManager.address, true]);
  await agentJobEscrow.write.setDisputeManager([disputeManager.address]);
  await disputeManager.write.setResolver([resolver.account.address, true]);

  for (const wallet of [deployer, client, agentOwner, evaluator, randomWallet, resolver]) {
    await mockUSDC.write.mint([wallet.account.address, USDC("100000")]);
  }

  await agentRegistry.write.registerAgent(
    [
      "Permission Audit Agent",
      "audit",
      "ipfs://permission-audit-agent",
      ethers.id("permission-audit-agent") as Address,
      operatingWallet.account.address,
      reserveWallet.account.address
    ],
    { account: agentOwner.account }
  );

  const walletByCaller: Record<CallerName, WalletClient> = {
    "Agent Owner": agentOwner,
    Client: client,
    Evaluator: evaluator,
    "Random Wallet": randomWallet,
    Resolver: resolver,
    Admin: deployer
  };

  return {
    deployer,
    client,
    agentOwner,
    evaluator,
    randomWallet,
    resolver,
    mockUSDC,
    agentRegistry,
    spendingPolicyManager,
    agentJobEscrow,
    disputeManager,
    walletByCaller,
    agentId: 1n
  };
}

async function deadline() {
  return BigInt(await networkHelpers.time.latest() + 86_400);
}

async function createOpenJob(ctx: Awaited<ReturnType<typeof deployFixture>>) {
  await ctx.agentJobEscrow.write.createJob(
    [ctx.agentId, ctx.evaluator.account.address, USDC("100"), USDC("10"), await deadline(), "ipfs://permission-audit-job"],
    { account: ctx.client.account }
  );
  return (await ctx.agentJobEscrow.read.nextJobId()) - 1n;
}

async function createFundedJob(ctx: Awaited<ReturnType<typeof deployFixture>>) {
  const jobId = await createOpenJob(ctx);
  await ctx.mockUSDC.write.approve([ctx.agentJobEscrow.address, USDC("110")], { account: ctx.client.account });
  await ctx.agentJobEscrow.write.fundJob([jobId], { account: ctx.client.account });
  return jobId;
}

async function createRunningJob(ctx: Awaited<ReturnType<typeof deployFixture>>) {
  const jobId = await createFundedJob(ctx);
  await ctx.agentJobEscrow.write.markRunning([jobId], { account: ctx.agentOwner.account });
  return jobId;
}

async function createSubmittedJob(ctx: Awaited<ReturnType<typeof deployFixture>>) {
  const jobId = await createRunningJob(ctx);
  await ctx.agentJobEscrow.write.submitDeliverable([jobId, "ipfs://permission-audit-deliverable"], { account: ctx.agentOwner.account });
  return jobId;
}

async function createDisputedJob(ctx: Awaited<ReturnType<typeof deployFixture>>) {
  const jobId = await createSubmittedJob(ctx);
  await ctx.agentJobEscrow.write.rejectToDispute([jobId, "ipfs://permission-audit-reason"], { account: ctx.client.account });
  return ctx.disputeManager.read.jobToDispute([jobId]);
}

function assertAllowed(matrix: Record<string, Record<CallerName, Result>>, action: string, allowed: CallerName[]) {
  for (const caller of callers) {
    assert.equal(
      matrix[action][caller].allowed,
      allowed.includes(caller),
      `${action} for ${caller}: ${matrix[action][caller].reason}`
    );
  }
}

describe("ArcPilot permission audit", function () {
  it("prints and enforces the job lifecycle permission matrix", async function () {
    const ctx = await deployFixture();
    const matrix: Record<string, Record<CallerName, Result>> = {};

    matrix.fundJob = {} as Record<CallerName, Result>;
    matrix.markRunning = {} as Record<CallerName, Result>;
    matrix.submitDeliverable = {} as Record<CallerName, Result>;
    matrix.approveAndRelease = {} as Record<CallerName, Result>;
    matrix.rejectToDispute = {} as Record<CallerName, Result>;
    matrix.resolveDispute = {} as Record<CallerName, Result>;
    matrix.openDisputeDirect = {} as Record<CallerName, Result>;

    for (const caller of callers) {
      const wallet = ctx.walletByCaller[caller];

      const openJob = await createOpenJob(ctx);
      if (caller === "Client") {
        await ctx.mockUSDC.write.approve([ctx.agentJobEscrow.address, USDC("110")], { account: wallet.account! });
      }
      matrix.fundJob[caller] = await attempt(() => ctx.agentJobEscrow.write.fundJob([openJob], { account: wallet.account! }));

      const fundedJob = await createFundedJob(ctx);
      matrix.markRunning[caller] = await attempt(() => ctx.agentJobEscrow.write.markRunning([fundedJob], { account: wallet.account! }));

      const runningJob = await createRunningJob(ctx);
      matrix.submitDeliverable[caller] = await attempt(() =>
        ctx.agentJobEscrow.write.submitDeliverable([runningJob, "ipfs://caller-deliverable"], { account: wallet.account! })
      );

      const submittedForApproval = await createSubmittedJob(ctx);
      matrix.approveAndRelease[caller] = await attempt(() =>
        ctx.agentJobEscrow.write.approveAndRelease([submittedForApproval], { account: wallet.account! })
      );

      const submittedForRejection = await createSubmittedJob(ctx);
      matrix.rejectToDispute[caller] = await attempt(() =>
        ctx.agentJobEscrow.write.rejectToDispute([submittedForRejection, "ipfs://caller-reason"], { account: wallet.account! })
      );

      const disputeId = await createDisputedJob(ctx);
      matrix.resolveDispute[caller] = await attempt(() =>
        ctx.disputeManager.write.resolveAgentWins([disputeId], { account: wallet.account! })
      );

      matrix.openDisputeDirect[caller] = await attempt(() =>
        ctx.disputeManager.write.openDispute([999n, wallet.account!.address, "ipfs://direct-open"], { account: wallet.account! })
      );
    }

    assertAllowed(matrix, "fundJob", ["Client"]);
    assertAllowed(matrix, "markRunning", ["Agent Owner"]);
    assertAllowed(matrix, "submitDeliverable", ["Agent Owner"]);
    assertAllowed(matrix, "approveAndRelease", ["Client", "Evaluator"]);
    assertAllowed(matrix, "rejectToDispute", ["Client", "Evaluator"]);
    assertAllowed(matrix, "resolveDispute", ["Resolver", "Admin"]);
    assertAllowed(matrix, "openDisputeDirect", []);

    console.log("\nArcPilot verified permission matrix");
    console.log("| Action | Agent Owner | Client | Evaluator | Random Wallet | Resolver | Admin |");
    console.log("| --- | --- | --- | --- | --- | --- | --- |");
    for (const action of ["fundJob", "markRunning", "submitDeliverable", "approveAndRelease", "rejectToDispute", "resolveDispute", "openDisputeDirect"]) {
      const cells = callers.map((caller) => matrix[action][caller].allowed ? "allowed" : "denied");
      console.log(`| ${action} | ${cells.join(" | ")} |`);
    }

    console.log("\nDenied-call revert reasons");
    for (const action of Object.keys(matrix)) {
      for (const caller of callers) {
        const result = matrix[action][caller];
        if (!result.allowed) console.log(`- ${action} / ${caller}: ${result.reason}`);
      }
    }
  });
});
