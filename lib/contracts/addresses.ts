import { isAddress } from "ethers";
import localDeployment from "./deployments.local.json";

export type ArcPilotContractName =
  | "MockUSDC"
  | "AgentRegistry"
  | "ClientRegistry"
  | "TrustBondVault"
  | "SpendingPolicyManager"
  | "AgentJobEscrow"
  | "DisputeManager";

export type LocalDeployment = {
  chainId: number;
  network: string;
  contracts: Record<ArcPilotContractName, `0x${string}`>;
};

export function assertAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value)) {
    throw new Error(`${label} is missing or is not a valid address`);
  }
  return value as `0x${string}`;
}

export function readLocalDeployment(): LocalDeployment {
  const parsed = JSON.parse(JSON.stringify(localDeployment)) as LocalDeployment;
  const names: ArcPilotContractName[] = [
    "MockUSDC",
    "AgentRegistry",
    "ClientRegistry",
    "TrustBondVault",
    "SpendingPolicyManager",
    "AgentJobEscrow",
    "DisputeManager"
  ];

  for (const name of names) {
    parsed.contracts[name] = assertAddress(parsed.contracts[name], `deployments.local.json contracts.${name}`);
  }

  return parsed;
}
