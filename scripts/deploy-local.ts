import hre from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ethers } from "ethers";

async function main() {
  const connection = await hre.network.connect();
  const { viem } = connection;
  const [deployer, client, agentOwner] = await viem.getWalletClients();

  const mockUSDC = await viem.deployContract("MockUSDC");
  const agentRegistry = await viem.deployContract("AgentRegistry");
  const clientRegistry = await viem.deployContract("ClientRegistry");
  const trustBondVault = await viem.deployContract("TrustBondVault", [
    mockUSDC.address,
    agentRegistry.address
  ]);
  const agentJobEscrow = await viem.deployContract("AgentJobEscrow", [
    mockUSDC.address,
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

  const sampleAmount = ethers.parseUnits("100000", 6);
  for (const wallet of [deployer, client, agentOwner]) {
    await mockUSDC.write.mint([wallet.account.address, sampleAmount]);
  }

  const deployment = {
    chainId: 31337,
    network: "localhost",
    contracts: {
      MockUSDC: mockUSDC.address,
      AgentRegistry: agentRegistry.address,
      ClientRegistry: clientRegistry.address,
      TrustBondVault: trustBondVault.address,
      SpendingPolicyManager: spendingPolicyManager.address,
      AgentJobEscrow: agentJobEscrow.address,
      DisputeManager: disputeManager.address
    }
  };

  const outputDir = resolve("lib/contracts");
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "deployments.local.json"), `${JSON.stringify(deployment, null, 2)}\n`);

  console.log("ArcPilot local deployment");
  console.log("MockUSDC:", deployment.contracts.MockUSDC);
  console.log("AgentRegistry:", deployment.contracts.AgentRegistry);
  console.log("ClientRegistry:", deployment.contracts.ClientRegistry);
  console.log("TrustBondVault:", deployment.contracts.TrustBondVault);
  console.log("SpendingPolicyManager:", deployment.contracts.SpendingPolicyManager);
  console.log("AgentJobEscrow:", deployment.contracts.AgentJobEscrow);
  console.log("DisputeManager:", deployment.contracts.DisputeManager);
  console.log("Saved:", resolve(outputDir, "deployments.local.json"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
