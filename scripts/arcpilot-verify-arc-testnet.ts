import { getArcTestnetRpcUrlFromEnv, getArcTestnetUsdcAddressFromEnv } from "../lib/config/env";
import { loadEnvFiles } from "../lib/contracts/runtime";
import {
  assertResults,
  loadArcTestnetDeploymentFromFileOrEnv,
  printResults,
  verifyArcTestnetDeployment
} from "../lib/contracts/verify";

async function main() {
  loadEnvFiles();
  const deployment = loadArcTestnetDeploymentFromFileOrEnv(getArcTestnetUsdcAddressFromEnv());
  const results = await verifyArcTestnetDeployment(getArcTestnetRpcUrlFromEnv(), deployment);
  printResults(results);
  assertResults(results);
  console.log("Arc Testnet deployment verification passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
