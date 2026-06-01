import { loadEnvFiles } from "../lib/contracts/runtime";

async function main() {
  loadEnvFiles();
  const baseURL = process.env.ARCPILOT_BASE_URL || "http://localhost:3000";
  for (const path of ["/api/health", "/api/health/supabase"]) {
    const response = await fetch(`${baseURL}${path}`);
    const data = await response.json();
    console.log(`${path}: ${response.status} ${JSON.stringify(data)}`);
    if (path === "/api/health" && (!data.resolverAdminConfigured || Number(data.resolverWalletCount) < 1)) {
      throw new Error("Resolver/admin wallet configuration is missing.");
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
