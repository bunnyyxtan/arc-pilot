import { logger } from "../../../../../lib/logger";
import { submitEvidence } from "../../../../../lib/sdk/disputes";
import { bodyPrivateKey, fail, ok, readJson, routeBigInt } from "../../../_utils";

export async function POST(request: Request, context: { params: Promise<{ disputeId: string }> }) {
  // Local/demo only. Do not use server private-key writes in production frontend.
  try {
    const { disputeId } = await context.params;
    const body = await readJson(request);
    const id = routeBigInt(disputeId, "disputeId");
    const evidenceURI = String(body.evidenceURI || "");
    logger.info("api.disputes.evidence", "submit:received", { disputeId: id, evidenceURI }, "Dispute evidence submit request received");
    const result = await submitEvidence(id, evidenceURI, bodyPrivateKey(body));
    logger.info("api.disputes.evidence", "submit:success", { disputeId: id, txHash: result.txHash }, "Dispute evidence submitted");
    return ok({ result });
  } catch (error) {
    return fail(error, 400, "api.disputes.evidence", "submit");
  }
}
