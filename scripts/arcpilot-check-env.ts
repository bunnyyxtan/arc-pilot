import { getEnvStatus, printEnvStatus } from "../lib/config/env";
import { logger } from "../lib/logger";
import { loadEnvFiles } from "../lib/contracts/runtime";

loadEnvFiles();
logger.info("scripts.checkEnv", "start", {}, "Checking ArcPilot environment readiness");
const rows = getEnvStatus();
printEnvStatus(rows);

const missingLocal = rows.filter((row) => row.required && row.note === "local demo" && !row.present);
const missingArc = rows.filter((row) => row.required && row.note === "Arc Testnet deploy" && !row.present);

if (missingLocal.length > 0) {
  logger.warn("scripts.checkEnv", "local:missing", { missing: missingLocal.map((row) => row.name) }, "Local demo environment is incomplete");
  console.log(`Local demo missing: ${missingLocal.map((row) => row.name).join(", ")}`);
}

if (missingArc.length > 0) {
  logger.warn("scripts.checkEnv", "arc:missing", { missing: missingArc.map((row) => row.name) }, "Arc Testnet deploy environment is incomplete");
  console.log(`Arc deploy missing: ${missingArc.map((row) => row.name).join(", ")}`);
}

logger.info("scripts.checkEnv", "complete", {
  localReady: missingLocal.length === 0,
  arcReady: missingArc.length === 0
}, "Environment readiness check complete");
