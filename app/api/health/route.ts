import { NextResponse } from "next/server";
import { getServerEnvReadiness } from "../../../lib/env/server";

export async function GET() {
  const readiness = getServerEnvReadiness();
  return NextResponse.json({
    ok: readiness.ok,
    environment: readiness.environment,
    chainMode: readiness.chainMode,
    supabase: readiness.supabase,
    contracts: readiness.contracts,
    walletSession: readiness.walletSession,
    openai: readiness.openai,
    resolverAdminConfigured: readiness.resolverAdminConfigured,
    resolverWalletCount: readiness.resolverWalletCount,
    services: {
      supabase: { configured: readiness.supabase === "configured" },
      contracts: { configured: readiness.contracts === "configured" },
      walletSession: { configured: readiness.walletSession === "configured" },
      openai: { configured: readiness.openai === "configured" },
      resolverAdmin: { configured: readiness.resolverAdminConfigured }
    },
    missing: readiness.missing,
    invalidContracts: readiness.invalidContracts
  }, { status: readiness.ok ? 200 : 503 });
}
