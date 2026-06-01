import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getResolverAdminWallets, isResolverAdminWallet } from "../lib/auth/resolver";
import { createWalletSessionToken, WALLET_SESSION_COOKIE } from "../lib/auth/wallet-session";
import { loadEnvFiles } from "../lib/contracts/runtime";

const knownResolver = "0x836BEEa5C4382196393C5DF8bA345E09F7b20Bd4";
const randomWallet = "0x0000000000000000000000000000000000000001";
const baseURL = process.env.ARCPILOT_BASE_URL || "http://localhost:3000";

async function read(relativePath: string) {
  return readFile(join(process.cwd(), relativePath), "utf8");
}

async function endpointChecks() {
  try {
    const health = await fetch(`${baseURL}/api/health`);
    if (!health.ok) throw new Error(`Health endpoint returned ${health.status}.`);
  } catch (error) {
    console.log(`skip resolver API checks: local app is unavailable (${error instanceof Error ? error.message : String(error)})`);
    return;
  }

  const denied = await fetch(`${baseURL}/api/disputes/1/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(denied.status, 403, "non-resolver API resolve attempt must return 403");

  const secret = process.env.ARC_WALLET_SESSION_SECRET || "";
  assert(secret.length >= 32, "ARC_WALLET_SESSION_SECRET must be configured for the resolver API check");
  const token = createWalletSessionToken(knownResolver, secret);
  const allowedThroughResolverGate = await fetch(`${baseURL}/api/disputes/1/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${WALLET_SESSION_COOKIE}=${encodeURIComponent(token)}`
    },
    body: "{}"
  });
  assert.notEqual(allowedThroughResolverGate.status, 403, "verified resolver must pass the API resolver gate");
  console.log(`ok resolver API gate: normal=${denied.status}, verified-resolver=${allowedThroughResolverGate.status}`);
}

async function main() {
  loadEnvFiles();
  assert.equal(isResolverAdminWallet(knownResolver), true, "checksum resolver wallet");
  assert.equal(isResolverAdminWallet(knownResolver.toLowerCase()), true, "lowercase resolver wallet");
  assert.equal(isResolverAdminWallet(randomWallet), false, "random wallet");
  assert(getResolverAdminWallets().length >= 1, "resolver wallet configuration");
  console.log(`ok resolver wallet helper (${getResolverAdminWallets().length} configured)`);

  const disputePage = await read("app/disputes/[disputeId]/page.tsx");
  assert(disputePage.includes("resolverWalletConnected"), "connected resolver UI state");
  assert(disputePage.includes("resolverSessionVerified"), "verified resolver UI state");
  assert(disputePage.includes("Verify Wallet Session"), "resolver session verification prompt");
  assert(disputePage.includes("<ResolverActions"), "resolver execution section");
  assert(disputePage.includes("Awaiting Resolution"), "normal wallet status copy");
  console.log("ok resolver UI branches");

  const userFacingFiles = [
    "app/disputes/[disputeId]/page.tsx",
    "app/disputes/page.tsx",
    "app/engine/diagnostics/page.tsx",
    "components/disputes/AIDisputeReviewCard.tsx",
    "components/disputes/ResolverActions.tsx"
  ];
  for (const file of userFacingFiles) {
    const source = await read(file);
    assert(!source.includes("gpt-4o-mini"), `${file}: exact model name leaked`);
    assert(!source.includes("reviewer_model"), `${file}: reviewer model leaked`);
  }
  console.log("ok user-facing model names hidden");

  await endpointChecks();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
