import { getContracts, getLocalWalletClient, loadEnvFiles, requireEnv } from "../lib/contracts/runtime";
import { formatUsdc } from "../lib/format/usdc";

async function main() {
  loadEnvFiles();
  const signer = getLocalWalletClient(requireEnv("DEMO_CLIENT_PRIVATE_KEY"));
  const contracts = getContracts(signer);
  const jobId = BigInt(requireEnv("JOB_ID"));
  const job = await contracts.AgentJobEscrow.getJob(jobId);
  const total = job.amount + job.clientBond;

  const approveTx = await contracts.MockUSDC.approve(contracts.deployment.contracts.AgentJobEscrow, total);
  await approveTx.wait();
  const fundTx = await contracts.AgentJobEscrow.fundJob(jobId);
  await fundTx.wait();

  console.log("Job funded");
  console.log("approvedUSDC:", formatUsdc(total));
  console.log("approveTxHash:", approveTx.hash);
  console.log("fundTxHash:", fundTx.hash);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
