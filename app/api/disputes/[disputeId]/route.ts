import { getDispute } from "../../../../lib/sdk/disputes";
import { logger } from "../../../../lib/logger";
import { fail, ok, routeBigInt } from "../../_utils";

export async function GET(_request: Request, context: { params: Promise<{ disputeId: string }> }) {
  try {
    const { disputeId } = await context.params;
    const id = routeBigInt(disputeId, "disputeId");
    logger.info("api.disputes", "read:received", { disputeId: id }, "Dispute read request received");
    const dispute = await getDispute(id);
    logger.info("api.disputes", "read:success", { disputeId: id }, "Dispute read request completed");
    return ok({ dispute });
  } catch (error) {
    return fail(error, 500, "api.disputes", "read");
  }
}
