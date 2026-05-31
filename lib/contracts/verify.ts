import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, isAddress } from "ethers";
import {
  ABIS,
  AGENT_JOB_ESCROW_ABI,
  AGENT_REGISTRY_ABI,
  CLIENT_REGISTRY_ABI,
  DISPUTE_MANAGER_ABI,
  MOCK_USDC_ABI,
  SPENDING_POLICY_MANAGER_ABI,
  TRUST_BOND_VAULT_ABI
} from "./abis";
import type { ArcPilotContractName, LocalDeployment } from "./addresses";
import { NETWORKS } from "../config/networks";

export type TestnetDeployment = {
  chainId: number;
  network: string;
  contracts: {
    USDC: `0x${string}`;
    AgentRegistry: `0x${string}`;
    ClientRegistry: `0x${string}`;
    TrustBondVault: `0x${string}`;
    SpendingPolicyManager: `0x${string}`;
    AgentJobEscrow: `0x${string}`;
    DisputeManager: `0x${string}`;
  };
};

export type VerificationResult = {
  label: string;
  ok: boolean;
  detail: string;
};

export const LOCAL_DEPLOYMENT_FILE = resolve("lib/contracts/deployments.local.json");
export const ARC_TESTNET_DEPLOYMENT_FILE = resolve("lib/contracts/deployments.arc-testnet.json");

const localContractNames: ArcPilotContractName[] = [
  "MockUSDC",
  "AgentRegistry",
  "ClientRegistry",
  "TrustBondVault",
  "SpendingPolicyManager",
  "AgentJobEscrow",
  "DisputeManager"
];

const testnetContractNames = [
  "AgentRegistry",
  "ClientRegistry",
  "TrustBondVault",
  "SpendingPolicyManager",
  "AgentJobEscrow",
  "DisputeManager"
] as const;

export function printResults(results: VerificationResult[]) {
  for (const result of results) {
    console.log(`${result.ok ? "OK" : "FAIL"} ${result.label}: ${result.detail}`);
  }
}

export function assertResults(results: VerificationResult[]) {
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(`Verification failed: ${failed.map((result) => result.label).join(", ")}`);
  }
}

export function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadArcTestnetDeploymentFromFileOrEnv(usdcFallback: `0x${string}`): TestnetDeployment {
  if (existsSync(ARC_TESTNET_DEPLOYMENT_FILE)) {
    return readJsonFile<TestnetDeployment>(ARC_TESTNET_DEPLOYMENT_FILE);
  }

  const required = {
    AgentRegistry: process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS,
    ClientRegistry: process.env.NEXT_PUBLIC_CLIENT_REGISTRY_ADDRESS,
    TrustBondVault: process.env.NEXT_PUBLIC_TRUST_BOND_VAULT_ADDRESS,
    SpendingPolicyManager: process.env.NEXT_PUBLIC_SPENDING_POLICY_ADDRESS,
    AgentJobEscrow: process.env.NEXT_PUBLIC_AGENT_JOB_ESCROW_ADDRESS,
    DisputeManager: process.env.NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS
  };

  for (const [name, value] of Object.entries(required)) {
    if (!value || !isAddress(value)) {
      throw new Error(`${name} address missing. Provide lib/contracts/deployments.arc-testnet.json or NEXT_PUBLIC_* env addresses.`);
    }
  }

  return {
    chainId: NETWORKS.arcTestnet.chainId,
    network: NETWORKS.arcTestnet.name,
    contracts: {
      USDC: (process.env.NEXT_PUBLIC_USDC_ADDRESS || usdcFallback) as `0x${string}`,
      AgentRegistry: required.AgentRegistry as `0x${string}`,
      ClientRegistry: required.ClientRegistry as `0x${string}`,
      TrustBondVault: required.TrustBondVault as `0x${string}`,
      SpendingPolicyManager: required.SpendingPolicyManager as `0x${string}`,
      AgentJobEscrow: required.AgentJobEscrow as `0x${string}`,
      DisputeManager: required.DisputeManager as `0x${string}`
    }
  };
}

export async function verifyLocalDeployment(rpcUrl: string, deploymentPath = LOCAL_DEPLOYMENT_FILE) {
  const results: VerificationResult[] = [];
  const provider = new JsonRpcProvider(rpcUrl, NETWORKS.localhost.chainId);

  let network;
  try {
    network = await provider.getNetwork();
    results.push({ label: "Local RPC reachable", ok: true, detail: rpcUrl });
  } catch (error) {
    results.push({ label: "Local RPC reachable", ok: false, detail: error instanceof Error ? error.message : "unreachable" });
    return results;
  }

  results.push({
    label: "Local chain ID",
    ok: Number(network.chainId) === NETWORKS.localhost.chainId,
    detail: network.chainId.toString()
  });

  results.push({
    label: "Local deployment artifact",
    ok: existsSync(deploymentPath),
    detail: deploymentPath
  });
  if (!existsSync(deploymentPath)) {
    return results;
  }

  const deployment = readJsonFile<LocalDeployment>(deploymentPath);
  for (const name of localContractNames) {
    const address = deployment.contracts[name];
    results.push({
      label: `${name} address`,
      ok: Boolean(address && isAddress(address)),
      detail: address || "missing"
    });
    if (address && isAddress(address)) {
      const code = await provider.getCode(address);
      results.push({
        label: `${name} bytecode`,
        ok: code !== "0x",
        detail: code === "0x" ? "no code" : "code present"
      });
    }
  }

  const usdc = new Contract(deployment.contracts.MockUSDC, MOCK_USDC_ABI, provider);
  const agentRegistry = new Contract(deployment.contracts.AgentRegistry, AGENT_REGISTRY_ABI, provider);
  const escrow = new Contract(deployment.contracts.AgentJobEscrow, AGENT_JOB_ESCROW_ABI, provider);
  const disputeManager = new Contract(deployment.contracts.DisputeManager, DISPUTE_MANAGER_ABI, provider);

  const decimals = await usdc.decimals();
  results.push({ label: "MockUSDC decimals", ok: Number(decimals) === 6, detail: decimals.toString() });
  results.push({ label: "AgentRegistry.nextAgentId", ok: (await agentRegistry.nextAgentId()) >= 1n, detail: (await agentRegistry.nextAgentId()).toString() });
  results.push({ label: "AgentJobEscrow.nextJobId", ok: (await escrow.nextJobId()) >= 1n, detail: (await escrow.nextJobId()).toString() });
  results.push({ label: "DisputeManager.nextDisputeId", ok: (await disputeManager.nextDisputeId()) >= 1n, detail: (await disputeManager.nextDisputeId()).toString() });

  return results;
}

export async function verifyArcTestnetDeployment(rpcUrl: string, deployment: TestnetDeployment) {
  const results: VerificationResult[] = [];
  const provider = new JsonRpcProvider(rpcUrl, NETWORKS.arcTestnet.chainId);

  let network;
  try {
    network = await provider.getNetwork();
    results.push({ label: "Arc Testnet RPC reachable", ok: true, detail: rpcUrl });
  } catch (error) {
    results.push({ label: "Arc Testnet RPC reachable", ok: false, detail: error instanceof Error ? error.message : "unreachable" });
    return results;
  }

  results.push({
    label: "Arc Testnet chain ID",
    ok: Number(network.chainId) === NETWORKS.arcTestnet.chainId,
    detail: network.chainId.toString()
  });

  const usdcCode = await provider.getCode(deployment.contracts.USDC);
  results.push({ label: "USDC bytecode", ok: usdcCode !== "0x", detail: deployment.contracts.USDC });

  if (usdcCode !== "0x") {
    const usdc = new Contract(deployment.contracts.USDC, MOCK_USDC_ABI, provider);
    const decimals = await usdc.decimals();
    results.push({ label: "USDC decimals", ok: Number(decimals) === 6, detail: decimals.toString() });
  }

  for (const name of testnetContractNames) {
    const address = deployment.contracts[name];
    results.push({ label: `${name} address`, ok: isAddress(address), detail: address });
    const code = await provider.getCode(address);
    results.push({ label: `${name} bytecode`, ok: code !== "0x", detail: code === "0x" ? "no code" : "code present" });
  }

  const agentRegistry = new Contract(deployment.contracts.AgentRegistry, AGENT_REGISTRY_ABI, provider);
  const clientRegistry = new Contract(deployment.contracts.ClientRegistry, CLIENT_REGISTRY_ABI, provider);
  const vault = new Contract(deployment.contracts.TrustBondVault, TRUST_BOND_VAULT_ABI, provider);
  const escrow = new Contract(deployment.contracts.AgentJobEscrow, AGENT_JOB_ESCROW_ABI, provider);
  const disputeManager = new Contract(deployment.contracts.DisputeManager, DISPUTE_MANAGER_ABI, provider);

  results.push({ label: "AgentRegistry.nextAgentId", ok: (await agentRegistry.nextAgentId()) >= 1n, detail: (await agentRegistry.nextAgentId()).toString() });
  results.push({ label: "AgentJobEscrow.nextJobId", ok: (await escrow.nextJobId()) >= 1n, detail: (await escrow.nextJobId()).toString() });
  results.push({ label: "DisputeManager.nextDisputeId", ok: (await disputeManager.nextDisputeId()) >= 1n, detail: (await disputeManager.nextDisputeId()).toString() });
  results.push({
    label: "Escrow dispute manager",
    ok: (await escrow.disputeManager()).toLowerCase() === deployment.contracts.DisputeManager.toLowerCase(),
    detail: await escrow.disputeManager()
  });
  results.push({
    label: "Escrow authorized in AgentRegistry",
    ok: await agentRegistry.authorizedUpdaters(deployment.contracts.AgentJobEscrow),
    detail: String(await agentRegistry.authorizedUpdaters(deployment.contracts.AgentJobEscrow))
  });
  results.push({
    label: "SpendingPolicy authorized in AgentRegistry",
    ok: await agentRegistry.authorizedUpdaters(deployment.contracts.SpendingPolicyManager),
    detail: String(await agentRegistry.authorizedUpdaters(deployment.contracts.SpendingPolicyManager))
  });
  results.push({
    label: "Escrow authorized in ClientRegistry",
    ok: await clientRegistry.authorizedUpdaters(deployment.contracts.AgentJobEscrow),
    detail: String(await clientRegistry.authorizedUpdaters(deployment.contracts.AgentJobEscrow))
  });
  results.push({
    label: "DisputeManager authorized in ClientRegistry",
    ok: await clientRegistry.authorizedUpdaters(deployment.contracts.DisputeManager),
    detail: String(await clientRegistry.authorizedUpdaters(deployment.contracts.DisputeManager))
  });
  results.push({
    label: "Escrow authorized in TrustBondVault",
    ok: await vault.authorizedOperators(deployment.contracts.AgentJobEscrow),
    detail: String(await vault.authorizedOperators(deployment.contracts.AgentJobEscrow))
  });
  results.push({
    label: "DisputeManager authorized in TrustBondVault",
    ok: await vault.authorizedOperators(deployment.contracts.DisputeManager),
    detail: String(await vault.authorizedOperators(deployment.contracts.DisputeManager))
  });

  return results;
}

export { ABIS, SPENDING_POLICY_MANAGER_ABI };
