import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { ethers } from "ethers";
import type { Address, WalletClient } from "viem";

const USDC = (value: string) => ethers.parseUnits(value, 6);

const Status = {
  Open: 0,
  Funded: 1,
  Running: 2,
  Submitted: 3,
  Completed: 4,
  Disputed: 6,
  Expired: 7,
  Refunded: 8
} as const;

const ExpenseType = {
  Data: 0,
  API: 1,
  Compute: 2,
  OtherAgent: 3,
  Other: 4
} as const;

const Outcome = {
  AgentWins: 1,
  ClientWins: 2,
  Split: 3
} as const;

const { viem, networkHelpers } = await network.create();
const publicClient = await viem.getPublicClient();

async function latestDeadline(offsetSeconds = 86_400) {
  return BigInt(await networkHelpers.time.latest() + offsetSeconds);
}

async function expectRejects(action: () => Promise<unknown>) {
  await assert.rejects(action);
}

async function deployFixture() {
  const [deployer, client, agentOwner, secondClient, random, resolver, operatingWallet, reserveWallet] =
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

  for (const wallet of [deployer, client, agentOwner, secondClient, random]) {
    await mockUSDC.write.mint([wallet.account.address, USDC("100000")]);
  }

  return {
    deployer,
    client,
    agentOwner,
    secondClient,
    random,
    resolver,
    operatingWallet,
    reserveWallet,
    mockUSDC,
    agentRegistry,
    clientRegistry,
    trustBondVault,
    spendingPolicyManager,
    agentJobEscrow,
    disputeManager
  };
}

async function registerAgent(ctx: Awaited<ReturnType<typeof deployFixture>>) {
  await ctx.agentRegistry.write.registerAgent(
    [
      "Ops Agent",
      "operations",
      "ipfs://agent",
      ethers.id("ops-agent") as Address,
      ctx.operatingWallet.account.address,
      ctx.reserveWallet.account.address
    ],
    { account: ctx.agentOwner.account }
  );
  return 1n;
}

async function depositBond(ctx: Awaited<ReturnType<typeof deployFixture>>, agentId: bigint, amount = USDC("1000")) {
  await ctx.mockUSDC.write.approve([ctx.trustBondVault.address, amount], { account: ctx.agentOwner.account });
  await ctx.trustBondVault.write.depositBond([agentId, amount], { account: ctx.agentOwner.account });
}

async function createFundedJob(
  ctx: Awaited<ReturnType<typeof deployFixture>>,
  options: {
    agentId: bigint;
    amount?: bigint;
    clientBond?: bigint;
    client?: WalletClient;
    evaluator?: Address;
    deadlineOffset?: number;
  }
) {
  const jobClient = options.client ?? ctx.client;
  const amount = options.amount ?? USDC("100");
  const clientBond = options.clientBond ?? USDC("10");
  const deadline = await latestDeadline(options.deadlineOffset ?? 86_400);

  await ctx.agentJobEscrow.write.createJob(
    [options.agentId, options.evaluator ?? jobClient.account!.address, amount, clientBond, deadline, "ipfs://job"],
    { account: jobClient.account! }
  );
  const jobId = (await ctx.agentJobEscrow.read.nextJobId()) - 1n;

  await ctx.mockUSDC.write.approve([ctx.agentJobEscrow.address, amount + clientBond], { account: jobClient.account! });
  await ctx.agentJobEscrow.write.fundJob([jobId], { account: jobClient.account! });

  return { jobId, amount, clientBond, client: jobClient };
}

async function submitJob(ctx: Awaited<ReturnType<typeof deployFixture>>, jobId: bigint) {
  await ctx.agentJobEscrow.write.markRunning([jobId], { account: ctx.agentOwner.account });
  await ctx.agentJobEscrow.write.submitDeliverable([jobId, "ipfs://deliverable"], {
    account: ctx.agentOwner.account
  });
}

async function openDisputedJob(ctx: Awaited<ReturnType<typeof deployFixture>>, agentId: bigint) {
  const job = await createFundedJob(ctx, { agentId });
  await submitJob(ctx, job.jobId);
  await ctx.agentJobEscrow.write.rejectToDispute([job.jobId, "ipfs://reason"], { account: ctx.client.account });
  const disputeId = await ctx.disputeManager.read.jobToDispute([job.jobId]);
  return { ...job, disputeId };
}

describe("ArcPilot contracts", function () {
  it("registers an agent and exposes profile, owner, active state, and reputation", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);

    const profile = await ctx.agentRegistry.read.getAgent([agentId]);
    assert.equal(profile.agentId, agentId);
    assert.equal(profile.owner.toLowerCase(), ctx.agentOwner.account.address.toLowerCase());
    assert.equal(profile.name, "Ops Agent");
    assert.equal(profile.category, "operations");
    assert.equal(profile.metadataURI, "ipfs://agent");
    assert.equal(profile.operatingWallet.toLowerCase(), ctx.operatingWallet.account.address.toLowerCase());
    assert.equal(profile.reserveWallet.toLowerCase(), ctx.reserveWallet.account.address.toLowerCase());
    assert.equal(profile.active, true);
    assert.equal(
      (await ctx.agentRegistry.read.ownerOfAgent([agentId])).toLowerCase(),
      ctx.agentOwner.account.address.toLowerCase()
    );
    assert.equal(await ctx.agentRegistry.read.isActiveAgent([agentId]), true);

    const score = await ctx.agentRegistry.read.getReputationScore([agentId]);
    assert.ok(score >= 0n && score <= 1000n);
  });

  it("updates client stats and score when a job is created", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    await ctx.agentJobEscrow.write.createJob(
      [agentId, ctx.client.account.address, USDC("100"), USDC("10"), await latestDeadline(), "ipfs://job"],
      { account: ctx.client.account }
    );

    const stats = await ctx.clientRegistry.read.getClientStats([ctx.client.account.address]);
    assert.equal(stats.jobsCreated, 1n);
    assert.equal(stats.totalPaid, USDC("100"));

    const score = await ctx.clientRegistry.read.getClientScore([ctx.client.account.address]);
    assert.ok(score >= 0n && score <= 1000n);
  });

  it("allows only the agent owner to deposit trust bond", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const bond = USDC("250");

    await ctx.mockUSDC.write.approve([ctx.trustBondVault.address, bond], { account: ctx.agentOwner.account });
    await ctx.trustBondVault.write.depositBond([agentId, bond], { account: ctx.agentOwner.account });
    assert.equal(await ctx.trustBondVault.read.bondOf([agentId]), bond);

    await ctx.mockUSDC.write.approve([ctx.trustBondVault.address, bond], { account: ctx.random.account });
    await expectRejects(() => ctx.trustBondVault.write.depositBond([agentId, bond], { account: ctx.random.account }));
  });

  it("enforces spending policies and logs valid expenses", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    await expectRejects(() =>
      ctx.spendingPolicyManager.write.setPolicy([agentId, USDC("100"), USDC("150"), true, true, false, false], {
        account: ctx.random.account
      })
    );

    await ctx.spendingPolicyManager.write.setPolicy([agentId, USDC("100"), USDC("150"), true, true, false, false], {
      account: ctx.agentOwner.account
    });

    await ctx.spendingPolicyManager.write.logExpense([1n, agentId, USDC("40"), ExpenseType.Data, "dataset"], {
      account: ctx.agentOwner.account
    });
    assert.equal(await ctx.spendingPolicyManager.read.getJobSpend([1n]), USDC("40"));
    const day = BigInt(Math.floor((await networkHelpers.time.latest()) / 86_400));
    assert.equal(await ctx.spendingPolicyManager.read.getAgentDailySpend([agentId, day]), USDC("40"));

    await expectRejects(() =>
      ctx.spendingPolicyManager.write.logExpense([1n, agentId, USDC("1"), ExpenseType.Compute, "gpu"], {
        account: ctx.agentOwner.account
      })
    );
    await expectRejects(() =>
      ctx.spendingPolicyManager.write.logExpense([1n, agentId, USDC("70"), ExpenseType.API, "api"], {
        account: ctx.agentOwner.account
      })
    );
    await ctx.spendingPolicyManager.write.logExpense([2n, agentId, USDC("100"), ExpenseType.API, "api"], {
      account: ctx.agentOwner.account
    });
    await expectRejects(() =>
      ctx.spendingPolicyManager.write.logExpense([3n, agentId, USDC("11"), ExpenseType.Data, "more"], {
        account: ctx.agentOwner.account
      })
    );
    await expectRejects(() =>
      ctx.spendingPolicyManager.write.logExpense([4n, agentId, USDC("1"), ExpenseType.Data, "bad signer"], {
        account: ctx.random.account
      })
    );
  });

  it("creates and funds jobs with 6-decimal USDC", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const { jobId, amount, clientBond } = await createFundedJob(ctx, { agentId });

    const job = await ctx.agentJobEscrow.read.getJob([jobId]);
    assert.equal(job.jobId, jobId);
    assert.equal(job.agentId, agentId);
    assert.equal(job.client.toLowerCase(), ctx.client.account.address.toLowerCase());
    assert.equal(job.amount, amount);
    assert.equal(job.clientBond, clientBond);
    assert.equal(job.status, Status.Funded);
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.agentJobEscrow.address]), amount + clientBond);
  });

  it("restricts running and deliverable submission to the agent owner", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const { jobId } = await createFundedJob(ctx, { agentId });

    await expectRejects(() => ctx.agentJobEscrow.write.markRunning([jobId], { account: ctx.random.account }));
    await ctx.agentJobEscrow.write.markRunning([jobId], { account: ctx.agentOwner.account });
    assert.equal((await ctx.agentJobEscrow.read.getJob([jobId])).status, Status.Running);

    await expectRejects(() =>
      ctx.agentJobEscrow.write.submitDeliverable([jobId, "ipfs://bad"], { account: ctx.random.account })
    );
    await ctx.agentJobEscrow.write.submitDeliverable([jobId, "ipfs://deliverable"], {
      account: ctx.agentOwner.account
    });
    assert.equal((await ctx.agentJobEscrow.read.getJob([jobId])).status, Status.Submitted);
  });

  it("approves submitted work, splits payment, returns client bond, and updates stats", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const { jobId, amount, clientBond } = await createFundedJob(ctx, { agentId });
    const operatingBefore = await ctx.mockUSDC.read.balanceOf([ctx.operatingWallet.account.address]);
    const reserveBefore = await ctx.mockUSDC.read.balanceOf([ctx.reserveWallet.account.address]);
    const clientBefore = await ctx.mockUSDC.read.balanceOf([ctx.client.account.address]);

    await submitJob(ctx, jobId);
    await ctx.agentJobEscrow.write.approveAndRelease([jobId], { account: ctx.client.account });

    assert.equal((await ctx.agentJobEscrow.read.getJob([jobId])).status, Status.Completed);
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.operatingWallet.account.address]), operatingBefore + USDC("80"));
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.reserveWallet.account.address]), reserveBefore + USDC("10"));
    assert.equal(await ctx.trustBondVault.read.bondOf([agentId]), USDC("10"));
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.client.account.address]), clientBefore + clientBond);

    const agentStats = await ctx.agentRegistry.read.getStats([agentId]);
    assert.equal(agentStats.completedJobs, 1n);
    assert.equal(agentStats.lifetimeEarned, amount);
    const clientStats = await ctx.clientRegistry.read.getClientStats([ctx.client.account.address]);
    assert.equal(clientStats.jobsApproved, 1n);

    const score = await ctx.agentRegistry.read.getReputationScore([agentId]);
    assert.ok(score >= 0n && score <= 1000n);
  });

  it("moves rejected work to dispute without instantly refunding escrow", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const { jobId, amount, clientBond, disputeId } = await openDisputedJob(ctx, agentId);

    assert.equal((await ctx.agentJobEscrow.read.getJob([jobId])).status, Status.Disputed);
    assert.equal(disputeId, 1n);
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.agentJobEscrow.address]), amount + clientBond);
    const dispute = await ctx.disputeManager.read.getDispute([disputeId]);
    assert.equal(dispute.jobId, jobId);
  });

  it("resolves an agent-wins dispute and blocks double resolution", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const { jobId, disputeId } = await openDisputedJob(ctx, agentId);
    const clientScoreBefore = await ctx.clientRegistry.read.getClientScore([ctx.client.account.address]);

    await ctx.disputeManager.write.resolveAgentWins([disputeId], { account: ctx.resolver.account });
    assert.equal((await ctx.agentJobEscrow.read.getJob([jobId])).status, Status.Completed);
    assert.equal((await ctx.disputeManager.read.getDispute([disputeId])).outcome, Outcome.AgentWins);
    assert.ok((await ctx.clientRegistry.read.getClientScore([ctx.client.account.address])) <= clientScoreBefore);
    await expectRejects(() => ctx.disputeManager.write.resolveAgentWins([disputeId], { account: ctx.resolver.account }));
  });

  it("resolves a client-wins dispute with refund and agent bond slash", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    await depositBond(ctx, agentId, USDC("500"));
    const { jobId, amount, clientBond, disputeId } = await openDisputedJob(ctx, agentId);
    const clientBefore = await ctx.mockUSDC.read.balanceOf([ctx.client.account.address]);

    await ctx.disputeManager.write.resolveClientWins([disputeId, USDC("25")], { account: ctx.resolver.account });

    assert.equal((await ctx.agentJobEscrow.read.getJob([jobId])).status, Status.Refunded);
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.client.account.address]), clientBefore + amount + clientBond + USDC("25"));
    assert.equal(await ctx.trustBondVault.read.bondOf([agentId]), USDC("475"));
    const agentStats = await ctx.agentRegistry.read.getStats([agentId]);
    assert.equal(agentStats.failedJobs, 1n);
    assert.equal(agentStats.disputedJobs, 1n);
    assert.equal(agentStats.totalSlashed, USDC("25"));
    const clientStats = await ctx.clientRegistry.read.getClientStats([ctx.client.account.address]);
    assert.equal(clientStats.disputesWon, 1n);
  });

  it("resolves split disputes and rejects invalid split bps", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const { jobId, amount, clientBond, disputeId } = await openDisputedJob(ctx, agentId);
    const clientBefore = await ctx.mockUSDC.read.balanceOf([ctx.client.account.address]);
    const operatingBefore = await ctx.mockUSDC.read.balanceOf([ctx.operatingWallet.account.address]);

    await expectRejects(() => ctx.disputeManager.write.resolveSplit([disputeId, 6000n, 3000n], { account: ctx.resolver.account }));
    await ctx.disputeManager.write.resolveSplit([disputeId, 6000n, 4000n], { account: ctx.resolver.account });

    assert.equal((await ctx.agentJobEscrow.read.getJob([jobId])).status, Status.Completed);
    assert.equal((await ctx.disputeManager.read.getDispute([disputeId])).outcome, Outcome.Split);
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.operatingWallet.account.address]), operatingBefore + (amount * 6000n * 8000n) / 100_000_000n);
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.client.account.address]), clientBefore + (amount * 4000n) / 10_000n + clientBond);
  });

  it("expires funded jobs after deadline and refuses submitted/completed/disputed expiry", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const { jobId, amount, clientBond } = await createFundedJob(ctx, { agentId, deadlineOffset: 60 });
    const clientBefore = await ctx.mockUSDC.read.balanceOf([ctx.client.account.address]);

    await networkHelpers.time.increase(61);
    await ctx.agentJobEscrow.write.expireAndRefund([jobId], { account: ctx.random.account });

    const job = await ctx.agentJobEscrow.read.getJob([jobId]);
    assert.ok(job.status === Status.Expired || job.status === Status.Refunded);
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.client.account.address]), clientBefore + amount + clientBond);

    const submitted = await createFundedJob(ctx, { agentId });
    await submitJob(ctx, submitted.jobId);
    await expectRejects(() => ctx.agentJobEscrow.write.expireAndRefund([submitted.jobId], { account: ctx.random.account }));
  });

  it("enforces treasury policy ownership and applies custom splits", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);

    await expectRejects(() =>
      ctx.agentJobEscrow.write.setTreasuryPolicy([agentId, 7000n, 1000n, 1000n], { account: ctx.agentOwner.account })
    );
    await expectRejects(() =>
      ctx.agentJobEscrow.write.setTreasuryPolicy([agentId, 7000n, 2000n, 1000n], { account: ctx.random.account })
    );
    await ctx.agentJobEscrow.write.setTreasuryPolicy([agentId, 7000n, 2000n, 1000n], {
      account: ctx.agentOwner.account
    });

    const { jobId } = await createFundedJob(ctx, { agentId, amount: USDC("100"), clientBond: 0n });
    const operatingBefore = await ctx.mockUSDC.read.balanceOf([ctx.operatingWallet.account.address]);
    const reserveBefore = await ctx.mockUSDC.read.balanceOf([ctx.reserveWallet.account.address]);
    await submitJob(ctx, jobId);
    await ctx.agentJobEscrow.write.approveAndRelease([jobId], { account: ctx.client.account });

    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.operatingWallet.account.address]), operatingBefore + USDC("70"));
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.reserveWallet.account.address]), reserveBefore + USDC("20"));
    assert.equal(await ctx.trustBondVault.read.bondOf([agentId]), USDC("10"));
  });

  it("enforces trust bond withdrawal cooldown", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    await depositBond(ctx, agentId, USDC("100"));

    await ctx.trustBondVault.write.requestWithdraw([agentId, USDC("40")], { account: ctx.agentOwner.account });
    await expectRejects(() => ctx.trustBondVault.write.executeWithdraw([agentId], { account: ctx.agentOwner.account }));

    await networkHelpers.time.increase(86_401);
    const ownerBefore = await ctx.mockUSDC.read.balanceOf([ctx.agentOwner.account.address]);
    await ctx.trustBondVault.write.executeWithdraw([agentId], { account: ctx.agentOwner.account });
    assert.equal(await ctx.trustBondVault.read.bondOf([agentId]), USDC("60"));
    assert.equal((await ctx.trustBondVault.read.pendingWithdrawals([agentId]))[0], 0n);
    assert.equal(await ctx.mockUSDC.read.balanceOf([ctx.agentOwner.account.address]), ownerBefore + USDC("40"));
  });

  it("enforces access control for admin, evaluator, dispute, and escrow-only paths", async function () {
    const ctx = await deployFixture();
    const agentId = await registerAgent(ctx);
    const { jobId } = await createFundedJob(ctx, { agentId });
    await submitJob(ctx, jobId);

    await expectRejects(() =>
      ctx.agentRegistry.write.setAuthorizedUpdater([ctx.random.account.address, true], { account: ctx.random.account })
    );
    await expectRejects(() =>
      ctx.trustBondVault.write.setAuthorizedOperator([ctx.random.account.address, true], { account: ctx.random.account })
    );
    await expectRejects(() => ctx.agentJobEscrow.write.approveAndRelease([jobId], { account: ctx.random.account }));
    await expectRejects(() => ctx.agentJobEscrow.write.releaseAfterDispute([jobId], { account: ctx.random.account }));
    await expectRejects(() =>
      ctx.disputeManager.write.openDispute([jobId, ctx.random.account.address, "ipfs://bad"], {
        account: ctx.random.account
      })
    );
  });
});
