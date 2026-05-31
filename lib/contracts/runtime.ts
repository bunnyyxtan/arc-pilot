import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, Wallet, type ContractRunner } from "ethers";
import { ABIS } from "./abis";
import { readLocalDeployment } from "./addresses";

export function loadEnvFiles() {
  for (const filename of [".env.local", ".env"]) {
    const filepath = resolve(filename);
    if (!existsSync(filepath)) {
      continue;
    }

    const contents = readFileSync(filepath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function requireEnv(name: string): string {
  loadEnvFiles();
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing. Add it to .env.local or .env.`);
  }
  return value;
}

export function getLocalRpcUrl() {
  loadEnvFiles();
  return process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
}

export function loadDeployment() {
  return readLocalDeployment();
}

export function getLocalPublicClient() {
  return new JsonRpcProvider(getLocalRpcUrl(), 31337);
}

export function getLocalWalletClient(privateKey: string) {
  if (!privateKey) {
    throw new Error("Private key is missing. Add the required demo private key to .env.local or .env.");
  }
  return new Wallet(privateKey, getLocalPublicClient());
}

export function getContracts(runner?: ContractRunner) {
  const deployment = loadDeployment();
  const contractRunner = runner ?? getLocalPublicClient();
  const { contracts } = deployment;

  return {
    deployment,
    MockUSDC: new Contract(contracts.MockUSDC, ABIS.MockUSDC, contractRunner),
    AgentRegistry: new Contract(contracts.AgentRegistry, ABIS.AgentRegistry, contractRunner),
    ClientRegistry: new Contract(contracts.ClientRegistry, ABIS.ClientRegistry, contractRunner),
    TrustBondVault: new Contract(contracts.TrustBondVault, ABIS.TrustBondVault, contractRunner),
    SpendingPolicyManager: new Contract(contracts.SpendingPolicyManager, ABIS.SpendingPolicyManager, contractRunner),
    AgentJobEscrow: new Contract(contracts.AgentJobEscrow, ABIS.AgentJobEscrow, contractRunner),
    DisputeManager: new Contract(contracts.DisputeManager, ABIS.DisputeManager, contractRunner)
  };
}

export function encodeJobURI(input: { title: string; description: string; deliverableVisibility?: "public" | "restricted"; jobMode?: "marketplace" | "self_use" }) {
  const encoded = Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
  return `arcpilot-job://${encoded}`;
}

export function decodeJobURI(jobURI: string): { title: string; description: string; deliverableVisibility?: "public" | "restricted"; jobMode?: "marketplace" | "self_use" } | null {
  if (!jobURI.startsWith("arcpilot-job://")) {
    return null;
  }

  try {
    const encoded = jobURI.slice("arcpilot-job://".length);
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      title?: unknown;
      description?: unknown;
      deliverableVisibility?: unknown;
      jobMode?: unknown;
    };
    if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
      return null;
    }
    return {
      title: parsed.title,
      description: parsed.description,
      deliverableVisibility: parsed.deliverableVisibility === "public" ? "public" : parsed.deliverableVisibility === "restricted" ? "restricted" : undefined,
      jobMode: parsed.jobMode === "self_use" ? "self_use" : parsed.jobMode === "marketplace" ? "marketplace" : undefined
    };
  } catch {
    return null;
  }
}

export async function waitForTx(tx: { wait: () => Promise<unknown> }) {
  return tx.wait();
}

export function getEventArg(receipt: unknown, contract: Contract, eventName: string, argName: string) {
  const logs = (receipt as { logs?: unknown[] }).logs ?? [];
  for (const log of logs) {
    try {
      const parsed = contract.interface.parseLog(log as Parameters<typeof contract.interface.parseLog>[0]);
      if (parsed?.name === eventName) {
        return parsed.args.getValue(argName);
      }
    } catch {
      // Ignore logs from other contracts.
    }
  }
  return undefined;
}
