import { getDispute } from "../../../../lib/sdk/disputes";
import { isResolverAdminWallet } from "../../../../lib/auth/resolver";
import { getVerifiedWalletFromRequest } from "../../../../lib/auth/wallet-session";
import { logger } from "../../../../lib/logger";
import { getIndexedDispute } from "../../../../lib/supabase/indexed-data";
import { fail, ok, routeBigInt } from "../../_utils";

export async function GET(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  try {
    const { disputeId } = await context.params;
    const id = routeBigInt(disputeId, "disputeId");
    logger.info("api.disputes", "read:received", { disputeId: id }, "Dispute read request received");
    const indexedDispute = await getIndexedDispute<Record<string, unknown>>(id);
    let dispute = indexedDispute;
    try {
      const liveDispute = await getDispute(id);
      dispute = { ...(indexedDispute ?? {}), ...liveDispute };
    } catch (error) {
      if (!indexedDispute) throw error;
      logger.warn("api.disputes", "read:onchainFallback", { disputeId: id, error }, "Using indexed dispute after Arc Testnet read failed");
    }
    logger.info("api.disputes", "read:success", { disputeId: id }, "Dispute read request completed");
    return ok({
      dispute,
      source: indexedDispute ? "indexed+onchain" : "onchain",
      access: {
        resolverAdminSession: isResolverAdminWallet(getVerifiedWalletFromRequest(request))
      }
    });
  } catch (error) {
    return fail(error, 500, "api.disputes", "read");
  }
}
