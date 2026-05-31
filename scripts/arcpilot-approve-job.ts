import { getContracts, getLocalWalletClient, loadEnvFiles, requireEnv } from "../lib/contracts/runtime";
import { formatUsdc } from "../lib/format/usdc";

async function main() {
  loadEnvFiles();
  const privateKey = process.env.EVALUATOR_PRIVATE_KEY || requireEnv("DEMO_CLIENT_PRIVATE_KEY");
  const signer = getLocalWalletClient(privateKey);
  const contracts = getContracts(signer);
  const jobId = BigInt(requireEnv("JOB_ID"));

  const approveTx = await contracts.AgentJobEscrow.approveAndRelease(jobId);
  await approveTx.wait();

  const job = await contracts.AgentJobEscrow.getJob(jobId);
  const agent = await contracts.AgentRegistry.getAgent(job.agentId);
  const stats = await contracts.AgentRegistry.getStats(job.agentId);
  const operatingBalance = await contracts.MockUSDC.balanceOf(agent.operatingWallet);
  const reserveBalance = await contracts.MockUSDC.balanceOf(agent.reserveWallet);
  const bondBalance = await contracts.TrustBondVault.bondOf(job.agentId);
  const score = await contracts.AgentRegistry.getReputationScore(job.agentId);

  console.log("Job approved and released");
  console.log("txHash:", approveTx.hash);
  console.log("operatingWalletUSDC:", formatUsdc(operatingBalance));
  console.log("reserveWalletUSDC:", formatUsdc(reserveBalance));
  console.log("bondBalanceUSDC:", formatUsdc(bondBalance));
  console.log("lifetimeEarnedUSDC:", formatUsdc(stats.lifetimeEarned));
  console.log("agentReputationScore:", score.toString());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
