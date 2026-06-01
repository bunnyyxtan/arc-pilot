import { isAddress } from "viem";

const REQUIRED_PRODUCTION_ENV = [
  "ARC_TESTNET_RPC_URL",
  "NEXT_PUBLIC_USDC_ADDRESS",
  "NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_CLIENT_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_TRUST_BOND_VAULT_ADDRESS",
  "NEXT_PUBLIC_AGENT_JOB_ESCROW_ADDRESS",
  "NEXT_PUBLIC_SPENDING_POLICY_ADDRESS",
  "NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ARC_WALLET_SESSION_SECRET",
  "OPENAI_API_KEY"
] as const;

const CONTRACT_ENV = [
  "NEXT_PUBLIC_USDC_ADDRESS",
  "NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_CLIENT_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_TRUST_BOND_VAULT_ADDRESS",
  "NEXT_PUBLIC_AGENT_JOB_ESCROW_ADDRESS",
  "NEXT_PUBLIC_SPENDING_POLICY_ADDRESS",
  "NEXT_PUBLIC_DISPUTE_MANAGER_ADDRESS"
] as const;

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getServerEnvReadiness() {
  const chainMode = process.env.NEXT_PUBLIC_CHAIN_MODE || "";
  const missing = REQUIRED_PRODUCTION_ENV.filter((name) => !present(name));
  const invalidContracts = CONTRACT_ENV.filter((name) => present(name) && !isAddress(process.env[name] || ""));
  const walletSecret = process.env.ARC_WALLET_SESSION_SECRET || "";
  return {
    environment: process.env.NODE_ENV || "development",
    chainMode,
    ok: chainMode === "arc" && missing.length === 0 && invalidContracts.length === 0 && walletSecret.length >= 32,
    missing,
    invalidContracts,
    supabase: present("NEXT_PUBLIC_SUPABASE_URL") && present("SUPABASE_SERVICE_ROLE_KEY") ? "configured" : "missing",
    contracts: CONTRACT_ENV.every((name) => present(name) && isAddress(process.env[name] || "")) ? "configured" : "missing",
    walletSession: walletSecret.length >= 32 ? "configured" : "missing",
    openai: present("OPENAI_API_KEY") ? "configured" : "missing"
  };
}

export function safeEnvLogContext() {
  const readiness = getServerEnvReadiness();
  return {
    environment: readiness.environment,
    chainMode: readiness.chainMode,
    missing: readiness.missing,
    invalidContracts: readiness.invalidContracts,
    supabase: readiness.supabase,
    contracts: readiness.contracts,
    walletSession: readiness.walletSession,
    openai: readiness.openai
  };
}
