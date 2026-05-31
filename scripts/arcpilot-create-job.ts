import { ZeroAddress } from "ethers";
import {
  encodeJobURI,
  getContracts,
  getEventArg,
  getLocalWalletClient,
  loadEnvFiles,
  requireEnv
} from "../lib/contracts/runtime";
import { parseUsdc } from "../lib/format/usdc";

async function main() {
  loadEnvFiles();
  const signer = getLocalWalletClient(requireEnv("DEMO_CLIENT_PRIVATE_KEY"));
  const contracts = getContracts(signer);

  const agentId = BigInt(requireEnv("AGENT_ID"));
  const jobTitle = requireEnv("JOB_TITLE");
  const jobDescription = requireEnv("JOB_DESCRIPTION");
  const amount = parseUsdc(requireEnv("JOB_AMOUNT_USDC"));
  const clientBond = parseUsdc(requireEnv("CLIENT_BOND_USDC"));
  const evaluator = process.env.EVALUATOR_ADDRESS || ZeroAddress;
  const deadlineMinutes = Number(process.env.DEADLINE_MINUTES_FROM_NOW || "60");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
  const jobURI = encodeJobURI({ title: jobTitle, description: jobDescription });

  const tx = await contracts.AgentJobEscrow.createJob(agentId, evaluator, amount, clientBond, deadline, jobURI);
  const receipt = await tx.wait();
  const jobId = getEventArg(receipt, contracts.AgentJobEscrow, "JobCreated", "jobId");

  console.log("Job created");
  console.log("txHash:", tx.hash);
  if (jobId !== undefined) {
    console.log("jobId:", jobId.toString());
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
