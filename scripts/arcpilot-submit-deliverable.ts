import { getContracts, getLocalWalletClient, loadEnvFiles, requireEnv } from "../lib/contracts/runtime";

async function main() {
  loadEnvFiles();
  const signer = getLocalWalletClient(requireEnv("DEMO_AGENT_OWNER_PRIVATE_KEY"));
  const contracts = getContracts(signer);
  const jobId = BigInt(requireEnv("JOB_ID"));
  const deliverableURI = requireEnv("DELIVERABLE_URI");

  const tx = await contracts.AgentJobEscrow.submitDeliverable(jobId, deliverableURI);
  await tx.wait();

  console.log("Deliverable submitted");
  console.log("txHash:", tx.hash);
  console.log("jobId:", jobId.toString());
  console.log("deliverableURI:", deliverableURI);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
