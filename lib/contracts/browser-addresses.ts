import { isAddress, type Address } from "viem";
import { ARC_TESTNET_USDC_ADDRESS } from "../chains/arc-testnet";

export type BrowserContractAddresses = {
  AgentRegistry: Address;
  ClientRegistry: Address;
  TrustBondVault: Address;
  SpendingPolicyManager: Address;
  AgentJobEscrow: Address;
  DisputeManager: Address;
  USDC: Address;
};

const publicEnv = {
  AgentRegistry: process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS,
  ClientRegistry: process.env.NEXT_PUBLIC_CLIENT_REGISTRY_ADDRESS,
  TrustBondVault: process.env.NEXT_PUBLIC_TRUST_BOND_VAULT_ADDRESS,
  SpendingPolicyManager: process.env.NEXT_PUBLIC_SPENDING_POLICY_ADDRESS,
  AgentJobEscrow: process.env.NEXT_PUBLIC_AGENT_JOB_ESCROW_ADDRESS,
  DisputeManager: process.env.NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS,
  USDC: process.env.NEXT_PUBLIC_USDC_ADDRESS || ARC_TESTNET_USDC_ADDRESS
} as const;

export function getMissingBrowserContracts() {
  return Object.entries(publicEnv)
    .filter(([, value]) => !value || !isAddress(value))
    .map(([name]) => name);
}

export function getBrowserContractAddresses(): BrowserContractAddresses | null {
  if (getMissingBrowserContracts().length > 0) return null;
  return publicEnv as BrowserContractAddresses;
}

