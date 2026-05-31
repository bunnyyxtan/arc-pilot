import { existsSync } from "node:fs";
import { Contract, JsonRpcProvider, Wallet, type ContractRunner } from "ethers";
import { NETWORKS, type NetworkKey } from "../config/networks";
import { getArcTestnetRpcUrlFromEnv, getArcTestnetUsdcAddressFromEnv, getLocalRpcUrlFromEnv } from "../config/env";
import { ABIS } from "../contracts/abis";
import { readLocalDeployment } from "../contracts/addresses";
import { logger, loggedOperation } from "../logger";
import {
  ARC_TESTNET_DEPLOYMENT_FILE,
  loadArcTestnetDeploymentFromFileOrEnv,
  type TestnetDeployment
} from "../contracts/verify";

// SDK core: resolves network/deployment context and returns ethers bindings used by API routes, scripts, and indexers.
export type ArcPilotNetwork = NetworkKey;

export type NormalizedDeployment = {
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

export function resolveNetwork(network?: ArcPilotNetwork): ArcPilotNetwork {
  if (network) {
    return network;
  }
  return process.env.NEXT_PUBLIC_CHAIN_MODE === "arc-testnet" || process.env.NEXT_PUBLIC_CHAIN_MODE === "arc" ? "arcTestnet" : "localhost";
}

export function getProvider(network?: ArcPilotNetwork) {
  const resolved = resolveNetwork(network);
  logger.debug("sdk.core", "provider:create", { network: resolved }, "Creating JSON-RPC provider");
  if (resolved === "arcTestnet") {
    return new JsonRpcProvider(getArcTestnetRpcUrlFromEnv(), NETWORKS.arcTestnet.chainId);
  }
  return new JsonRpcProvider(getLocalRpcUrlFromEnv(), NETWORKS.localhost.chainId);
}

export function loadSdkDeployment(network?: ArcPilotNetwork): NormalizedDeployment {
  const resolved = resolveNetwork(network);
  logger.debug("sdk.core", "deployment:load", { network: resolved }, "Loading SDK deployment artifact");
  if (resolved === "arcTestnet") {
    if (!existsSync(ARC_TESTNET_DEPLOYMENT_FILE)) {
      return loadArcTestnetDeploymentFromFileOrEnv(getArcTestnetUsdcAddressFromEnv());
    }
    return loadArcTestnetDeploymentFromFileOrEnv(getArcTestnetUsdcAddressFromEnv()) as TestnetDeployment;
  }

  const local = readLocalDeployment();
  return {
    chainId: local.chainId,
    network: local.network,
    contracts: {
      USDC: local.contracts.MockUSDC,
      AgentRegistry: local.contracts.AgentRegistry,
      ClientRegistry: local.contracts.ClientRegistry,
      TrustBondVault: local.contracts.TrustBondVault,
      SpendingPolicyManager: local.contracts.SpendingPolicyManager,
      AgentJobEscrow: local.contracts.AgentJobEscrow,
      DisputeManager: local.contracts.DisputeManager
    }
  };
}

export function getSigner(privateKey: string, network?: ArcPilotNetwork) {
  if (!privateKey) {
    logger.warn("sdk.core", "signer:missingPrivateKey", { network: resolveNetwork(network) }, "Signer creation failed");
    throw new Error("A private key is required for this write operation.");
  }
  logger.debug("sdk.core", "signer:create", { network: resolveNetwork(network) }, "Creating signer for write operation");
  return new Wallet(privateKey, getProvider(network));
}

export function getSdkContracts(runner?: ContractRunner, network?: ArcPilotNetwork) {
  const deployment = loadSdkDeployment(network);
  const contractRunner = runner ?? getProvider(network);
  logger.debug("sdk.core", "contracts:create", { network: deployment.network, chainId: deployment.chainId }, "Creating contract bindings");

  return {
    deployment,
    USDC: new Contract(deployment.contracts.USDC, ABIS.MockUSDC, contractRunner),
    AgentRegistry: new Contract(deployment.contracts.AgentRegistry, ABIS.AgentRegistry, contractRunner),
    ClientRegistry: new Contract(deployment.contracts.ClientRegistry, ABIS.ClientRegistry, contractRunner),
    TrustBondVault: new Contract(deployment.contracts.TrustBondVault, ABIS.TrustBondVault, contractRunner),
    SpendingPolicyManager: new Contract(deployment.contracts.SpendingPolicyManager, ABIS.SpendingPolicyManager, contractRunner),
    AgentJobEscrow: new Contract(deployment.contracts.AgentJobEscrow, ABIS.AgentJobEscrow, contractRunner),
    DisputeManager: new Contract(deployment.contracts.DisputeManager, ABIS.DisputeManager, contractRunner)
  };
}

export async function getArcPilotOverview(network?: ArcPilotNetwork) {
  return loggedOperation("sdk.core", "overview:read", { network: resolveNetwork(network) }, async () => {
    const contracts = getSdkContracts(undefined, network);
    const [nextAgentId, nextJobId, nextDisputeId] = await Promise.all([
      contracts.AgentRegistry.nextAgentId() as Promise<bigint>,
      contracts.AgentJobEscrow.nextJobId() as Promise<bigint>,
      contracts.DisputeManager.nextDisputeId() as Promise<bigint>
    ]);

    return {
      totalAgents: nextAgentId - 1n,
      totalJobs: nextJobId - 1n,
      totalDisputes: nextDisputeId - 1n
    };
  });
}
