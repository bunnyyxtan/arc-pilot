import { loadEnvFiles } from "../lib/contracts/runtime";
import { backfillMissingIndexedDisputes, getDisputeIndexStatus } from "../lib/indexer/dispute-sync";

function printStatus(status: Awaited<ReturnType<typeof getDisputeIndexStatus>>) {
  console.log(`Live onchain disputes: ${status.liveOnchainDisputes}`);
  console.log(`indexed_disputes rows: ${status.indexedDisputes}`);
  console.log(`Missing indexed disputes: ${status.missingIndexedDisputes}`);
  console.log(`Last dispute ID indexed: ${status.lastIndexedDisputeId ?? "none"}`);
  console.log(`Missing dispute IDs: ${status.missingDisputeIds.length > 0 ? status.missingDisputeIds.join(", ") : "none"}`);
}

async function main() {
  loadEnvFiles();
  const shouldFix = process.argv.includes("--fix");
  console.log("ArcPilot dispute index check");
  let status = await getDisputeIndexStatus("arcTestnet");
  printStatus(status);

  if (status.stale && shouldFix) {
    const repair = await backfillMissingIndexedDisputes("arcTestnet", "script");
    console.log(`Missing disputes recovered: ${repair.recoveredDisputeIds.length}`);
    for (const warning of repair.warnings) console.warn(`warning ${warning}`);
    status = repair.after;
    printStatus(status);
  }

  if (status.stale) {
    console.warn("warning indexed_disputes is stale");
    console.warn("Run npm run arc:disputes:check -- --fix or npm run arc:supabase:sync to recover missing disputes.");
    process.exitCode = 1;
    return;
  }

  console.log("ok indexed_disputes is current");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
