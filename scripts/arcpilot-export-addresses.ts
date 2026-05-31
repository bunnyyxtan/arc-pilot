import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { ARC_TESTNET_DEPLOYMENT_FILE, LOCAL_DEPLOYMENT_FILE } from "../lib/contracts/verify";

type AnyDeployment = {
  contracts: Record<string, string>;
};

const target = process.env.DEPLOYMENT_TARGET || process.argv[2] || "local";
const path = target === "arc-testnet" || target === "testnet" ? ARC_TESTNET_DEPLOYMENT_FILE : LOCAL_DEPLOYMENT_FILE;

if (!existsSync(path)) {
  throw new Error(`Deployment artifact not found: ${path}`);
}

const deployment = JSON.parse(readFileSync(path, "utf8")) as AnyDeployment;
const contracts = deployment.contracts;

const usdc = contracts.USDC || contracts.MockUSDC;

console.log(`NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=${contracts.AgentRegistry || ""}`);
console.log(`NEXT_PUBLIC_CLIENT_REGISTRY_ADDRESS=${contracts.ClientRegistry || ""}`);
console.log(`NEXT_PUBLIC_TRUST_BOND_VAULT_ADDRESS=${contracts.TrustBondVault || ""}`);
console.log(`NEXT_PUBLIC_AGENT_JOB_ESCROW_ADDRESS=${contracts.AgentJobEscrow || ""}`);
console.log(`NEXT_PUBLIC_SPENDING_POLICY_ADDRESS=${contracts.SpendingPolicyManager || ""}`);
console.log(`NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS=${contracts.DisputeManager || ""}`);
console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdc || ""}`);
