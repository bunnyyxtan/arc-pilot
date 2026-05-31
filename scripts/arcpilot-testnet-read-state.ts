import { Contract, JsonRpcProvider } from "ethers";
import { getArcTestnetRpcUrlFromEnv, getArcTestnetUsdcAddressFromEnv } from "../lib/config/env";
import { NETWORKS } from "../lib/config/networks";
import {
  AGENT_JOB_ESCROW_ABI,
  AGENT_REGISTRY_ABI,
  DISPUTE_MANAGER_ABI,
  MOCK_USDC_ABI
} from "../lib/contracts/abis";
import { loadEnvFiles } from "../lib/contracts/runtime";
import { loadArcTestnetDeploymentFromFileOrEnv } from "../lib/contracts/verify";

async function main() {
  loadEnvFiles();
  const deployment = loadArcTestnetDeploymentFromFileOrEnv(getArcTestnetUsdcAddressFromEnv());
  const provider = new JsonRpcProvider(getArcTestnetRpcUrlFromEnv(), NETWORKS.arcTestnet.chainId);
  const usdc = new Contract(deployment.contracts.USDC, MOCK_USDC_ABI, provider);
  const agentRegistry = new Contract(deployment.contracts.AgentRegistry, AGENT_REGISTRY_ABI, provider);
  const escrow = new Contract(deployment.contracts.AgentJobEscrow, AGENT_JOB_ESCROW_ABI, provider);
  const disputeManager = new Contract(deployment.contracts.DisputeManager, DISPUTE_MANAGER_ABI, provider);

  const nextAgentId = await agentRegistry.nextAgentId();
  const nextJobId = await escrow.nextJobId();
  const nextDisputeId = await disputeManager.nextDisputeId();

  console.log("ArcPilot Arc Testnet state");
  console.log("totalAgents:", (nextAgentId - 1n).toString());
  console.log("totalJobs:", (nextJobId - 1n).toString());
  console.log("totalDisputes:", (nextDisputeId - 1n).toString());
  console.log("usdcDecimals:", (await usdc.decimals()).toString());
  console.log("USDC:", deployment.contracts.USDC);
  console.log("AgentRegistry:", deployment.contracts.AgentRegistry);
  console.log("ClientRegistry:", deployment.contracts.ClientRegistry);
  console.log("TrustBondVault:", deployment.contracts.TrustBondVault);
  console.log("SpendingPolicyManager:", deployment.contracts.SpendingPolicyManager);
  console.log("AgentJobEscrow:", deployment.contracts.AgentJobEscrow);
  console.log("DisputeManager:", deployment.contracts.DisputeManager);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
