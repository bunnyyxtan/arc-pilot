import { getLocalRpcUrlFromEnv } from "../lib/config/env";
import { assertResults, printResults, verifyLocalDeployment } from "../lib/contracts/verify";
import { logger } from "../lib/logger";
import { loadEnvFiles } from "../lib/contracts/runtime";

async function main() {
  loadEnvFiles();
  const rpcUrl = getLocalRpcUrlFromEnv();
  logger.info("scripts.verifyLocal", "start", { rpcUrl }, "Starting local deployment verification");
  const results = await verifyLocalDeployment(rpcUrl);
  printResults(results);
  assertResults(results);
  logger.info("scripts.verifyLocal", "success", { checks: results.length }, "Local deployment verification passed");
  console.log("Local deployment verification passed");
}

main().catch((error) => {
  logger.error("scripts.verifyLocal", "failed", { error }, "Local deployment verification failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
