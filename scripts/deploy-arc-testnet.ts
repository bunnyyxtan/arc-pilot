import hre from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Address } from "viem";
import { NETWORKS } from "../lib/config/networks";
import { loadEnvFiles } from "../lib/contracts/runtime";

const ERC20_DECIMALS_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }]
  }
] as const;

function addressFromEnvOrFallback(name: string, fallback: Address): Address {
  const value = process.env[name] ?? fallback;
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a valid 20-byte hex address`);
  }
  return value as Address;
}

async function main() {
  loadEnvFiles();
  const usdcAddress = addressFromEnvOrFallback("NEXT_PUBLIC_USDC_ADDRESS", NETWORKS.arcTestnet.usdcFallback);

  const connection = await hre.network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();
  if (chainId !== NETWORKS.arcTestnet.chainId) {
    throw new Error(`Wrong network. Expected Arc Testnet chain ${NETWORKS.arcTestnet.chainId}, got ${chainId}.`);
  }

  const usdcBytecode = await publicClient.getBytecode({ address: usdcAddress });
  if (!usdcBytecode || usdcBytecode === "0x") {
    throw new Error(`USDC address has no bytecode: ${usdcAddress}`);
  }

  const usdcDecimals = await publicClient.readContract({
    address: usdcAddress,
    abi: ERC20_DECIMALS_ABI,
    functionName: "decimals"
  });
  if (usdcDecimals !== 6) {
    throw new Error(`USDC decimals must be 6. Got ${usdcDecimals}.`);
  }

  const agentRegistry = await viem.deployContract("AgentRegistry");
  const clientRegistry = await viem.deployContract("ClientRegistry");
  const trustBondVault = await viem.deployContract("TrustBondVault", [usdcAddress, agentRegistry.address]);
  const agentJobEscrow = await viem.deployContract("AgentJobEscrow", [
    usdcAddress,
    agentRegistry.address,
    clientRegistry.address,
    trustBondVault.address
  ]);
  const spendingPolicyManager = await viem.deployContract("SpendingPolicyManager", [agentRegistry.address]);
  const disputeManager = await viem.deployContract("DisputeManager", [
    agentJobEscrow.address,
    agentRegistry.address,
    clientRegistry.address,
    trustBondVault.address
  ]);

  await agentRegistry.write.setAuthorizedUpdater([agentJobEscrow.address, true]);
  await agentRegistry.write.setAuthorizedUpdater([spendingPolicyManager.address, true]);
  await clientRegistry.write.setAuthorizedUpdater([agentJobEscrow.address, true]);
  await clientRegistry.write.setAuthorizedUpdater([disputeManager.address, true]);
  await trustBondVault.write.setAuthorizedOperator([agentJobEscrow.address, true]);
  await trustBondVault.write.setAuthorizedOperator([disputeManager.address, true]);
  await agentJobEscrow.write.setDisputeManager([disputeManager.address]);

  const deployment = {
    chainId: 0,
    network: "arc-testnet",
    contracts: {
      USDC: usdcAddress,
      AgentRegistry: agentRegistry.address,
      ClientRegistry: clientRegistry.address,
      TrustBondVault: trustBondVault.address,
      SpendingPolicyManager: spendingPolicyManager.address,
      AgentJobEscrow: agentJobEscrow.address,
      DisputeManager: disputeManager.address
    }
  };

  deployment.chainId = chainId;

  const outputDir = resolve("lib/contracts");
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "deployments.arc-testnet.json"), `${JSON.stringify(deployment, null, 2)}\n`);

  console.log("ArcPilot Arc Testnet deployment");
  console.log("Network:", NETWORKS.arcTestnet.name);
  console.log("Chain ID:", deployment.chainId);
  console.log("USDC:", deployment.contracts.USDC);
  console.log("USDC decimals:", usdcDecimals);
  console.log("AgentRegistry:", deployment.contracts.AgentRegistry);
  console.log("ClientRegistry:", deployment.contracts.ClientRegistry);
  console.log("TrustBondVault:", deployment.contracts.TrustBondVault);
  console.log("SpendingPolicyManager:", deployment.contracts.SpendingPolicyManager);
  console.log("AgentJobEscrow:", deployment.contracts.AgentJobEscrow);
  console.log("DisputeManager:", deployment.contracts.DisputeManager);
  console.log("Saved:", resolve(outputDir, "deployments.arc-testnet.json"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
