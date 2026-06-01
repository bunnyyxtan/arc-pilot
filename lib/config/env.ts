import { NETWORKS } from "./networks";

export const LOCAL_DEMO_ENV = [
  "OPENAI_API_KEY",
  "DEMO_CLIENT_PRIVATE_KEY",
  "DEMO_AGENT_OWNER_PRIVATE_KEY",
  "LOCAL_RPC_URL"
] as const;

export const ARC_DEPLOY_ENV = ["DEPLOYER_PRIVATE_KEY", "ARC_TESTNET_RPC_URL"] as const;

export type EnvStatus = {
  name: string;
  required: boolean;
  present: boolean;
  note: string;
};

export function envValue(name: string, fallback?: string) {
  return process.env[name] || fallback;
}

export function requireConfig(name: string, fallback?: string) {
  const value = envValue(name, fallback);
  if (!value) {
    throw new Error(`${name} is missing. Add it to .env.local or .env.`);
  }
  return value;
}

export function getLocalRpcUrlFromEnv() {
  return requireConfig(NETWORKS.localhost.rpcEnv, NETWORKS.localhost.defaultRpcUrl);
}

export function getArcTestnetRpcUrlFromEnv() {
  return requireConfig(NETWORKS.arcTestnet.rpcEnv, NETWORKS.arcTestnet.defaultRpcUrl);
}

export function getArcTestnetUsdcAddressFromEnv() {
  return envValue("NEXT_PUBLIC_USDC_ADDRESS", NETWORKS.arcTestnet.usdcFallback) as `0x${string}`;
}

export function getEnvStatus(): EnvStatus[] {
  const rows: EnvStatus[] = [];

  for (const name of LOCAL_DEMO_ENV) {
    rows.push({
      name,
      required: true,
      present: Boolean(process.env[name]),
      note: "local demo"
    });
  }

  for (const name of ARC_DEPLOY_ENV) {
    rows.push({
      name,
      required: true,
      present: Boolean(process.env[name]),
      note: "Arc Testnet deploy"
    });
  }

  rows.push({
    name: "NEXT_PUBLIC_USDC_ADDRESS",
    required: false,
    present: Boolean(process.env.NEXT_PUBLIC_USDC_ADDRESS),
    note: `Arc Testnet USDC, fallback ${NETWORKS.arcTestnet.usdcFallback}`
  });

  return rows;
}

export function printEnvStatus(rows = getEnvStatus()) {
  console.log("ArcPilot environment readiness");
  console.log("Variable | Required | Status | Scope");
  console.log("--- | --- | --- | ---");
  for (const row of rows) {
    console.log(`${row.name} | ${row.required ? "yes" : "no"} | ${row.present ? "present" : "missing"} | ${row.note}`);
  }
}
