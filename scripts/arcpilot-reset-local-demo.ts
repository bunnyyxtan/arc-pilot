import { readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DELIVERABLES_DIR } from "../lib/openai/deliverable";

async function main() {
  console.log("ArcPilot local reset flow");
  console.log("1. Stop the running Hardhat node.");
  console.log("2. Start a fresh node: npx hardhat node");
  console.log("3. Redeploy: npm run arc:deploy-local");
  console.log("4. Re-run checks: npm run arc:verify-local && npm run arc:smoke");

  if (process.env.CLEAR_DELIVERABLES !== "true") {
    console.log("Local deliverables were not cleared. Set CLEAR_DELIVERABLES=true to remove generated JSON files.");
    return;
  }

  if (!existsSync(DELIVERABLES_DIR)) {
    console.log("No deliverables directory found.");
    return;
  }

  const files = await readdir(DELIVERABLES_DIR);
  let removed = 0;
  for (const file of files) {
    if (file === ".gitkeep" || !file.endsWith(".json")) {
      continue;
    }
    await unlink(resolve(DELIVERABLES_DIR, file));
    removed += 1;
  }
  console.log(`Removed ${removed} generated deliverable JSON file(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
