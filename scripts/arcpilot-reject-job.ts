import { getContracts, getEventArg, getLocalWalletClient, loadEnvFiles, requireEnv } from "../lib/contracts/runtime";

async function main() {
  loadEnvFiles();
  const signer = getLocalWalletClient(requireEnv("DEMO_CLIENT_PRIVATE_KEY"));
  const contracts = getContracts(signer);
  const jobId = BigInt(requireEnv("JOB_ID"));
  const reasonURI = process.env.REASON_URI || "local-dispute://client-rejection";

  const tx = await contracts.AgentJobEscrow.rejectToDispute(jobId, reasonURI);
  const receipt = await tx.wait();
  const disputeId =
    getEventArg(receipt, contracts.AgentJobEscrow, "JobMovedToDispute", "disputeId") ??
    (await contracts.DisputeManager.jobToDispute(jobId));
  const dispute = await contracts.DisputeManager.getDispute(disputeId);

  console.log("Job moved to dispute");
  console.log("txHash:", tx.hash);
  console.log("jobId:", jobId.toString());
  console.log("disputeId:", disputeId.toString());
  console.log("reasonURI:", dispute.reasonURI);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
