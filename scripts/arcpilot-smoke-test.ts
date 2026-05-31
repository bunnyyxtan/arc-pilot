import { ethers, type ContractRunner } from "ethers";
import {
  getContracts,
  getEventArg,
  getLocalPublicClient,
  getLocalWalletClient,
  loadEnvFiles,
  encodeJobURI
} from "../lib/contracts/runtime";
import { formatUsdc, parseUsdc } from "../lib/format/usdc";
import { logger } from "../lib/logger";

async function getSmokeSigners() {
  loadEnvFiles();
  if (process.env.DEMO_CLIENT_PRIVATE_KEY && process.env.DEMO_AGENT_OWNER_PRIVATE_KEY) {
    return {
      client: getLocalWalletClient(process.env.DEMO_CLIENT_PRIVATE_KEY),
      agentOwner: getLocalWalletClient(process.env.DEMO_AGENT_OWNER_PRIVATE_KEY),
      source: "env private keys"
    };
  }

  const provider = getLocalPublicClient();
  const accounts = await provider.listAccounts();
  if (accounts.length < 2) {
    throw new Error("DEMO_CLIENT_PRIVATE_KEY and DEMO_AGENT_OWNER_PRIVATE_KEY are missing, and the local node has fewer than two unlocked accounts.");
  }

  return {
    client: accounts[0],
    agentOwner: accounts[1],
    source: "unlocked localhost accounts"
  };
}

async function main() {
  logger.info("scripts.smoke", "start", {}, "Starting local onchain smoke test");
  loadEnvFiles();
  const { client, agentOwner, source } = await getSmokeSigners();
  logger.info("scripts.smoke", "signers:ready", { signerSource: source }, "Smoke signers resolved");
  const clientContracts = getContracts(client as ContractRunner);
  const agentContracts = getContracts(agentOwner as ContractRunner);
  const readContracts = getContracts();

  const clientAddress = await client.getAddress();
  const agentOwnerAddress = await agentOwner.getAddress();
  const operatingWallet = process.env.OPERATING_WALLET || agentOwnerAddress;
  const reserveWallet = process.env.RESERVE_WALLET || agentOwnerAddress;

  logger.info("scripts.smoke", "mint:start", { clientAddress, agentOwnerAddress }, "Minting local MockUSDC for smoke test");
  await (await clientContracts.MockUSDC.mint(clientAddress, parseUsdc("1000"))).wait();
  await (await agentContracts.MockUSDC.mint(agentOwnerAddress, parseUsdc("1000"))).wait();

  logger.info("scripts.smoke", "agent:registerStart", { agentOwnerAddress, operatingWallet, reserveWallet }, "Registering smoke agent");
  const registerTx = await agentContracts.AgentRegistry.registerAgent(
    "SmokePilot",
    "Smoke",
    "local-agent://smoke-pilot",
    ethers.keccak256(ethers.toUtf8Bytes("smoke test")),
    operatingWallet,
    reserveWallet
  );
  const registerReceipt = await registerTx.wait();
  const agentId = BigInt(getEventArg(registerReceipt, agentContracts.AgentRegistry, "AgentRegistered", "agentId"));
  logger.info("scripts.smoke", "agent:registerSuccess", { agentId, txHash: registerTx.hash }, "Smoke agent registered");

  const bondAmount = parseUsdc("5");
  logger.info("scripts.smoke", "bond:depositStart", { agentId, bondAmount }, "Depositing trust bond");
  await (await agentContracts.MockUSDC.approve(agentContracts.deployment.contracts.TrustBondVault, bondAmount)).wait();
  await (await agentContracts.TrustBondVault.depositBond(agentId, bondAmount)).wait();

  await (
    await agentContracts.SpendingPolicyManager.setPolicy(
      agentId,
      parseUsdc("1"),
      parseUsdc("5"),
      true,
      true,
      true,
      false
    )
  ).wait();

  const amount = parseUsdc("3");
  const clientBond = parseUsdc("1");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const createTx = await clientContracts.AgentJobEscrow.createJob(
    agentId,
    clientAddress,
    amount,
    clientBond,
    deadline,
    encodeJobURI({ title: "Smoke test job", description: "Verify onchain job lifecycle without OpenAI." })
  );
  const createReceipt = await createTx.wait();
  const jobId = BigInt(getEventArg(createReceipt, clientContracts.AgentJobEscrow, "JobCreated", "jobId"));
  logger.info("scripts.smoke", "job:createSuccess", { agentId, jobId, txHash: createTx.hash }, "Smoke job created");

  logger.info("scripts.smoke", "job:lifecycleStart", { jobId }, "Funding, running, submitting, and approving smoke job");
  await (await clientContracts.MockUSDC.approve(clientContracts.deployment.contracts.AgentJobEscrow, amount + clientBond)).wait();
  await (await clientContracts.AgentJobEscrow.fundJob(jobId)).wait();
  await (await agentContracts.AgentJobEscrow.markRunning(jobId)).wait();
  await (await agentContracts.AgentJobEscrow.submitDeliverable(jobId, "local-deliverable://smoke-test")).wait();
  await (await clientContracts.AgentJobEscrow.approveAndRelease(jobId)).wait();

  const job = await readContracts.AgentJobEscrow.getJob(jobId);
  const agentScore = await readContracts.AgentRegistry.getReputationScore(agentId);
  const clientScore = await readContracts.ClientRegistry.getClientScore(clientAddress);
  const bondBalance = await readContracts.TrustBondVault.bondOf(agentId);
  const operatingBalance = await readContracts.MockUSDC.balanceOf(operatingWallet);
  const reserveBalance = await readContracts.MockUSDC.balanceOf(reserveWallet);
  logger.info("scripts.smoke", "complete", { agentId, jobId, status: job.status, agentScore, clientScore, bondBalance }, "Local smoke test completed");

  console.log("ArcPilot smoke test complete");
  console.log("signerSource:", source);
  console.log("agentId:", agentId.toString());
  console.log("jobId:", jobId.toString());
  console.log("status:", job.status.toString());
  console.log("agentScore:", agentScore.toString());
  console.log("clientScore:", clientScore.toString());
  console.log("bondBalanceUSDC:", formatUsdc(bondBalance));
  console.log("operatingWalletBalanceUSDC:", formatUsdc(operatingBalance));
  console.log("reserveWalletBalanceUSDC:", formatUsdc(reserveBalance));
}

main().catch((error) => {
  logger.error("scripts.smoke", "failed", { error }, "Local smoke test failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
