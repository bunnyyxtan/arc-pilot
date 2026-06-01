import { getProvider } from "../../../../lib/sdk/arcpilot";
import { syncDisputeForJob } from "../../../../lib/indexer/dispute-sync";
import { NETWORKS } from "../../../../lib/config/networks";
import { fail, ok, readJson, routeBigInt } from "../../_utils";

class InvalidDisputeSyncRequestError extends Error {}

function requireArcTestnetMode() {
  if (process.env.NEXT_PUBLIC_CHAIN_MODE !== "arc" && process.env.NEXT_PUBLIC_CHAIN_MODE !== "arc-testnet") {
    throw new Error("Arc Testnet chain mode is required for dispute indexing.");
  }
}

export async function POST(request: Request) {
  try {
    requireArcTestnetMode();
    const body = await readJson(request);
    const jobId = routeBigInt(typeof body.jobId === "string" ? body.jobId : String(body.jobId ?? ""), "jobId");
    const txHash = typeof body.txHash === "string" ? body.txHash.trim() : "";
    if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      throw new InvalidDisputeSyncRequestError("txHash must be a valid transaction hash.");
    }

    const network = await getProvider("arcTestnet").getNetwork();
    if (Number(network.chainId) !== NETWORKS.arcTestnet.chainId) {
      throw new Error(`Arc Testnet RPC chain ID mismatch. Expected ${NETWORKS.arcTestnet.chainId}.`);
    }

    const result = await syncDisputeForJob({
      jobId,
      txHash,
      network: "arcTestnet",
      source: "api"
    });
    return ok({
      jobId: result.job.jobId,
      disputeId: result.dispute.disputeId,
      indexed: result.indexed,
      warnings: result.warnings
    });
  } catch (error) {
    return fail(error, error instanceof InvalidDisputeSyncRequestError ? 400 : 500, "api.disputes.sync", "create");
  }
}
