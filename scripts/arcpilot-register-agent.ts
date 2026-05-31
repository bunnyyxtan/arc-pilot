import { ethers } from "ethers";
import { getContracts, getEventArg, getLocalWalletClient, loadEnvFiles, requireEnv } from "../lib/contracts/runtime";

function input(name: string, fallback?: string) {
  return process.env[name] || fallback || "";
}

async function main() {
  loadEnvFiles();
  const signer = getLocalWalletClient(requireEnv("DEMO_AGENT_OWNER_PRIVATE_KEY"));
  const contracts = getContracts(signer);

  const name = input("AGENT_NAME");
  const category = input("AGENT_CATEGORY");
  const metadataURI = input("AGENT_METADATA_URI", "local-agent://metadata");
  const skills = input("AGENT_SKILLS");
  const operatingWallet = input("OPERATING_WALLET");
  const reserveWallet = input("RESERVE_WALLET");

  if (!name || !category || !skills || !operatingWallet || !reserveWallet) {
    throw new Error("AGENT_NAME, AGENT_CATEGORY, AGENT_SKILLS, OPERATING_WALLET, and RESERVE_WALLET are required.");
  }

  const skillsHash = ethers.keccak256(ethers.toUtf8Bytes(skills));
  const tx = await contracts.AgentRegistry.registerAgent(
    name,
    category,
    metadataURI,
    skillsHash,
    operatingWallet,
    reserveWallet
  );
  const receipt = await tx.wait();
  const agentId = getEventArg(receipt, contracts.AgentRegistry, "AgentRegistered", "agentId");

  console.log("Agent registered");
  console.log("txHash:", tx.hash);
  if (agentId !== undefined) {
    console.log("agentId:", agentId.toString());
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
