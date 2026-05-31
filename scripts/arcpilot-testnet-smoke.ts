import { Contract, JsonRpcProvider, Wallet, ethers } from "ethers";
import { getArcTestnetRpcUrlFromEnv, getArcTestnetUsdcAddressFromEnv, requireConfig } from "../lib/config/env";
import { NETWORKS } from "../lib/config/networks";
import {
  AGENT_JOB_ESCROW_ABI,
  AGENT_REGISTRY_ABI,
  CLIENT_REGISTRY_ABI,
  MOCK_USDC_ABI,
  SPENDING_POLICY_MANAGER_ABI,
  TRUST_BOND_VAULT_ABI
} from "../lib/contracts/abis";
import { encodeJobURI, getEventArg, loadEnvFiles } from "../lib/contracts/runtime";
import { formatUsdc, parseUsdc } from "../lib/format/usdc";
import { loadArcTestnetDeploymentFromFileOrEnv } from "../lib/contracts/verify";

async function main() {
  loadEnvFiles();
  const deployment = loadArcTestnetDeploymentFromFileOrEnv(getArcTestnetUsdcAddressFromEnv());
  const provider = new JsonRpcProvider(getArcTestnetRpcUrlFromEnv(), NETWORKS.arcTestnet.chainId);
  const wallet = new Wallet(requireConfig("DEPLOYER_PRIVATE_KEY"), provider);
  const deployer = await wallet.getAddress();
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== NETWORKS.arcTestnet.chainId) {
    throw new Error(`Wrong network. Expected ${NETWORKS.arcTestnet.chainId}, got ${network.chainId.toString()}.`);
  }

  const usdc = new Contract(deployment.contracts.USDC, MOCK_USDC_ABI, wallet);
  const agentRegistry = new Contract(deployment.contracts.AgentRegistry, AGENT_REGISTRY_ABI, wallet);
  const clientRegistry = new Contract(deployment.contracts.ClientRegistry, CLIENT_REGISTRY_ABI, wallet);
  const vault = new Contract(deployment.contracts.TrustBondVault, TRUST_BOND_VAULT_ABI, wallet);
  const policy = new Contract(deployment.contracts.SpendingPolicyManager, SPENDING_POLICY_MANAGER_ABI, wallet);
  const escrow = new Contract(deployment.contracts.AgentJobEscrow, AGENT_JOB_ESCROW_ABI, wallet);

  const nativeBefore = await provider.getBalance(deployer);
  const usdcBefore = await usdc.balanceOf(deployer);
  const requiredUsdc = parseUsdc("0.22");

  if (nativeBefore === 0n) {
    throw new Error("Deployer native gas balance is zero. Fund the fresh Arc Testnet wallet with gas USDC before smoke testing.");
  }
  if (usdcBefore < requiredUsdc) {
    throw new Error(`Deployer ERC-20 USDC balance is too low. Need at least ${formatUsdc(requiredUsdc)} USDC; found ${formatUsdc(usdcBefore)}.`);
  }

  const txHashes: string[] = [];
  const registerTx = await agentRegistry.registerAgent(
    "TestnetResearchPilot",
    "Research",
    "testnet://arcpilot-agent",
    ethers.keccak256(ethers.toUtf8Bytes("Arc testnet research smoke")),
    deployer,
    deployer
  );
  txHashes.push(registerTx.hash);
  const registerReceipt = await registerTx.wait();
  const agentId = BigInt(getEventArg(registerReceipt, agentRegistry, "AgentRegistered", "agentId"));

  const bondAmount = parseUsdc("0.1");
  const approveBondTx = await usdc.approve(deployment.contracts.TrustBondVault, bondAmount);
  txHashes.push(approveBondTx.hash);
  await approveBondTx.wait();
  const depositTx = await vault.depositBond(agentId, bondAmount);
  txHashes.push(depositTx.hash);
  await depositTx.wait();

  const policyTx = await policy.setPolicy(agentId, parseUsdc("0.05"), parseUsdc("0.5"), true, true, true, false);
  txHashes.push(policyTx.hash);
  await policyTx.wait();

  const amount = parseUsdc("0.1");
  const clientBond = parseUsdc("0.02");
  const createTx = await escrow.createJob(
    agentId,
    deployer,
    amount,
    clientBond,
    BigInt(Math.floor(Date.now() / 1000) + 3600),
    encodeJobURI({ title: "Arc Testnet smoke job", description: "Minimal real ArcPilot testnet lifecycle." })
  );
  txHashes.push(createTx.hash);
  const createReceipt = await createTx.wait();
  const jobId = BigInt(getEventArg(createReceipt, escrow, "JobCreated", "jobId"));

  const approveEscrowTx = await usdc.approve(deployment.contracts.AgentJobEscrow, amount + clientBond);
  txHashes.push(approveEscrowTx.hash);
  await approveEscrowTx.wait();
  const fundTx = await escrow.fundJob(jobId);
  txHashes.push(fundTx.hash);
  await fundTx.wait();
  const runningTx = await escrow.markRunning(jobId);
  txHashes.push(runningTx.hash);
  await runningTx.wait();
  const submitTx = await escrow.submitDeliverable(jobId, "local-deliverable://arc-testnet-smoke");
  txHashes.push(submitTx.hash);
  await submitTx.wait();
  const approveTx = await escrow.approveAndRelease(jobId);
  txHashes.push(approveTx.hash);
  await approveTx.wait();

  const job = await escrow.getJob(jobId);
  const agentScore = await agentRegistry.getReputationScore(agentId);
  const clientScore = await clientRegistry.getClientScore(deployer);
  const bondBalance = await vault.bondOf(agentId);
  const usdcAfter = await usdc.balanceOf(deployer);

  console.log("ArcPilot Arc Testnet smoke complete");
  console.log("agentId:", agentId.toString());
  console.log("jobId:", jobId.toString());
  console.log("jobStatus:", job.status.toString());
  console.log("reputationScore:", agentScore.toString());
  console.log("clientScore:", clientScore.toString());
  console.log("trustBondBalanceUSDC:", formatUsdc(bondBalance));
  console.log("deployerUSDCBefore:", formatUsdc(usdcBefore));
  console.log("deployerUSDCAfter:", formatUsdc(usdcAfter));
  console.log("txHashes:", txHashes.join(", "));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
