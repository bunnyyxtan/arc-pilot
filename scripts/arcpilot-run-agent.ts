import {
  decodeJobURI,
  getContracts,
  getLocalWalletClient,
  loadEnvFiles,
  requireEnv
} from "../lib/contracts/runtime";
import { runAgentJob } from "../lib/openai/agent-runner";
import { isDeliverableType } from "../lib/openai/prompts";

async function main() {
  loadEnvFiles();
  const providerContracts = getContracts();
  const jobId = BigInt(requireEnv("JOB_ID"));
  const job = await providerContracts.AgentJobEscrow.getJob(jobId);
  const agent = await providerContracts.AgentRegistry.getAgent(job.agentId);
  const decodedJob = decodeJobURI(job.jobURI);
  const deliverableTypeInput = process.env.DELIVERABLE_TYPE || "general";

  if (!isDeliverableType(deliverableTypeInput)) {
    throw new Error("DELIVERABLE_TYPE must be research, content, code, or general.");
  }

  const result = await runAgentJob({
    agentName: process.env.AGENT_NAME || agent.name,
    agentCategory: process.env.AGENT_CATEGORY || agent.category,
    jobTitle: process.env.JOB_TITLE || decodedJob?.title || `Job ${jobId.toString()}`,
    jobDescription: process.env.JOB_DESCRIPTION || decodedJob?.description || job.jobURI,
    deliverableType: deliverableTypeInput
  });

  console.log("Agent deliverable generated");
  console.log("deliverableHash:", result.deliverableHash);
  console.log("deliverableURI:", result.deliverableURI);

  if (process.env.AUTO_SUBMIT === "true") {
    const signer = getLocalWalletClient(requireEnv("DEMO_AGENT_OWNER_PRIVATE_KEY"));
    const contracts = getContracts(signer);
    const submitTx = await contracts.AgentJobEscrow.submitDeliverable(jobId, result.deliverableURI);
    await submitTx.wait();
    console.log("submitTxHash:", submitTx.hash);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
