import { ethers } from "ethers";
import {
  encodeJobURI,
  getContracts,
  getEventArg,
  getLocalWalletClient,
  loadEnvFiles,
  requireEnv
} from "../lib/contracts/runtime";
import { formatUsdc, parseUsdc } from "../lib/format/usdc";
import { logger } from "../lib/logger";
import { runAgentJob } from "../lib/openai/agent-runner";

async function main() {
  logger.info("scripts.fullDemo", "start", {}, "Starting full local GPT demo");
  loadEnvFiles();
  if (!process.env.OPENAI_API_KEY) {
    logger.warn("scripts.fullDemo", "env:missingApiKey", {}, "OpenAI API key is missing");
    throw new Error("OPENAI_API_KEY is missing. Add it to .env.local or .env.");
  }

  const client = getLocalWalletClient(requireEnv("DEMO_CLIENT_PRIVATE_KEY"));
  const agentOwner = getLocalWalletClient(requireEnv("DEMO_AGENT_OWNER_PRIVATE_KEY"));
  const clientContracts = getContracts(client);
  const agentContracts = getContracts(agentOwner);
  const readContracts = getContracts();

  const agentOwnerAddress = await agentOwner.getAddress();
  const clientAddress = await client.getAddress();
  const operatingWallet = process.env.OPERATING_WALLET || agentOwnerAddress;
  const reserveWallet = process.env.RESERVE_WALLET || agentOwnerAddress;

  logger.info("scripts.fullDemo", "agent:registerStart", { agentOwnerAddress, operatingWallet, reserveWallet }, "Registering demo agent");
  const registerTx = await agentContracts.AgentRegistry.registerAgent(
    "ResearchPilot",
    "Research",
    "local-agent://research-pilot",
    ethers.keccak256(ethers.toUtf8Bytes("Arc research, market intelligence, technical summaries")),
    operatingWallet,
    reserveWallet
  );
  const registerReceipt = await registerTx.wait();
  const agentId = BigInt(getEventArg(registerReceipt, agentContracts.AgentRegistry, "AgentRegistered", "agentId"));
  logger.info("scripts.fullDemo", "agent:registerSuccess", { agentId, txHash: registerTx.hash }, "Demo agent registered");

  const trustBond = parseUsdc("100");
  logger.info("scripts.fullDemo", "bond:depositStart", { agentId, trustBond }, "Depositing demo trust bond");
  const approveBondTx = await agentContracts.MockUSDC.approve(clientContracts.deployment.contracts.TrustBondVault, trustBond);
  await approveBondTx.wait();
  const depositTx = await agentContracts.TrustBondVault.depositBond(agentId, trustBond);
  await depositTx.wait();

  const policyTx = await agentContracts.SpendingPolicyManager.setPolicy(
    agentId,
    parseUsdc("2"),
    parseUsdc("10"),
    true,
    true,
    true,
    false
  );
  await policyTx.wait();
  logger.info("scripts.fullDemo", "policy:setSuccess", { agentId, txHash: policyTx.hash }, "Spending policy set");

  const jobTitle = "Analyze Arc agentic economy opportunity";
  const jobDescription =
    "Create a structured report on the opportunity for autonomous AI agents to manage wallets, job escrow, trust bonds, and treasury flows on Arc.";
  const jobAmount = parseUsdc("25");
  const clientBond = parseUsdc("5");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
  const createJobTx = await clientContracts.AgentJobEscrow.createJob(
    agentId,
    clientAddress,
    jobAmount,
    clientBond,
    deadline,
    encodeJobURI({ title: jobTitle, description: jobDescription })
  );
  const createJobReceipt = await createJobTx.wait();
  const jobId = BigInt(getEventArg(createJobReceipt, clientContracts.AgentJobEscrow, "JobCreated", "jobId"));
  logger.info("scripts.fullDemo", "job:createSuccess", { agentId, jobId, txHash: createJobTx.hash }, "Demo job created");

  const approveJobTx = await clientContracts.MockUSDC.approve(
    clientContracts.deployment.contracts.AgentJobEscrow,
    jobAmount + clientBond
  );
  await approveJobTx.wait();
  const fundTx = await clientContracts.AgentJobEscrow.fundJob(jobId);
  await fundTx.wait();
  logger.info("scripts.fullDemo", "job:fundSuccess", { jobId, txHash: fundTx.hash }, "Demo job funded");

  const runningTx = await agentContracts.AgentJobEscrow.markRunning(jobId);
  await runningTx.wait();
  logger.info("scripts.fullDemo", "job:running", { jobId, txHash: runningTx.hash }, "Demo job marked running");

  logger.info("scripts.fullDemo", "agentRunner:start", { jobId, agentId, deliverableType: "research" }, "Running GPT agent");
  const deliverable = await runAgentJob({
    agentName: "ResearchPilot",
    agentCategory: "Research",
    jobTitle,
    jobDescription,
    deliverableType: "research"
  });

  const submitTx = await agentContracts.AgentJobEscrow.submitDeliverable(jobId, deliverable.deliverableURI);
  await submitTx.wait();
  logger.info("scripts.fullDemo", "job:submitSuccess", { jobId, deliverableHash: deliverable.deliverableHash, txHash: submitTx.hash }, "Deliverable submitted onchain");

  const releaseTx = await clientContracts.AgentJobEscrow.approveAndRelease(jobId);
  await releaseTx.wait();
  logger.info("scripts.fullDemo", "job:releaseSuccess", { jobId, txHash: releaseTx.hash }, "Demo job approved and released");

  const finalJob = await readContracts.AgentJobEscrow.getJob(jobId);
  const agentStats = await readContracts.AgentRegistry.getStats(agentId);
  const clientScore = await readContracts.ClientRegistry.getClientScore(clientAddress);
  const agentScore = await readContracts.AgentRegistry.getReputationScore(agentId);
  const bondBalance = await readContracts.TrustBondVault.bondOf(agentId);
  const operatingBalance = await readContracts.MockUSDC.balanceOf(operatingWallet);
  const reserveBalance = await readContracts.MockUSDC.balanceOf(reserveWallet);
  logger.info("scripts.fullDemo", "complete", { agentId, jobId, deliverableHash: deliverable.deliverableHash, agentScore, clientScore, bondBalance, jobStatus: finalJob.status }, "Full local GPT demo completed");

  console.log("ArcPilot full local demo complete");
  console.log("agentId:", agentId.toString());
  console.log("jobId:", jobId.toString());
  console.log("deliverableHash:", deliverable.deliverableHash);
  console.log("deliverableURI:", deliverable.deliverableURI);
  console.log("clientScore:", clientScore.toString());
  console.log("agentScore:", agentScore.toString());
  console.log("bondBalanceUSDC:", formatUsdc(bondBalance));
  console.log("lifetimeEarnedUSDC:", formatUsdc(agentStats.lifetimeEarned));
  console.log("operatingWalletBalanceUSDC:", formatUsdc(operatingBalance));
  console.log("reserveWalletBalanceUSDC:", formatUsdc(reserveBalance));
  console.log("jobStatus:", finalJob.status.toString());
}

main().catch((error) => {
  logger.error("scripts.fullDemo", "failed", { error }, "Full local GPT demo failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
