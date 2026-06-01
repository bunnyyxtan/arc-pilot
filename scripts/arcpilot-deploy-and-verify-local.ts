import { execFileSync } from "node:child_process";
import { getLocalRpcUrlFromEnv } from "../lib/config/env";
import { assertResults, printResults, verifyLocalDeployment } from "../lib/contracts/verify";
import { logger } from "../lib/logger";
import { loadEnvFiles } from "../lib/contracts/runtime";

async function main() {
  loadEnvFiles();
  logger.info("scripts.deployLocal", "start", { platform: process.platform }, "Starting local deployment and verification");
  if (process.platform === "win32") {
    logger.info("scripts.deployLocal", "deploy:start", { command: "npx hardhat run scripts/deploy-local.ts --network localhost" }, "Running local deploy script");
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npx.cmd hardhat run scripts/deploy-local.ts --network localhost"], {
      stdio: "inherit"
    });
  } else {
    logger.info("scripts.deployLocal", "deploy:start", { command: "npx hardhat run scripts/deploy-local.ts --network localhost" }, "Running local deploy script");
    execFileSync("npx", ["hardhat", "run", "scripts/deploy-local.ts", "--network", "localhost"], {
      stdio: "inherit"
    });
  }

  const rpcUrl = getLocalRpcUrlFromEnv();
  logger.info("scripts.deployLocal", "verify:start", { rpcUrl }, "Verifying local deployment");
  const results = await verifyLocalDeployment(rpcUrl);
  printResults(results);
  assertResults(results);
  logger.info("scripts.deployLocal", "success", { checks: results.length }, "Local deployment and verification passed");
  console.log("Local deployment and verification passed");
}

main().catch((error) => {
  logger.error("scripts.deployLocal", "failed", { error }, "Local deployment and verification failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
