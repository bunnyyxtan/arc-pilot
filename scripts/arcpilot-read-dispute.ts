import { getDispute } from "../lib/sdk/disputes";
import { bigintJson } from "../lib/sdk/types";

const disputeId = process.env.DISPUTE_ID;
if (!disputeId) {
  throw new Error("DISPUTE_ID is required.");
}

console.log(JSON.stringify(bigintJson({ dispute: await getDispute(BigInt(disputeId)) }), null, 2));
