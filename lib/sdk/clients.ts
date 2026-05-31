import { getSdkContracts, type ArcPilotNetwork } from "./arcpilot";
import { loggedOperation } from "../logger";

export async function getClientStats(address: `0x${string}`, network?: ArcPilotNetwork) {
  return loggedOperation("sdk.clients", "getClientStats", { clientAddress: address, network }, async () => {
    const stats = await getSdkContracts(undefined, network).ClientRegistry.getClientStats(address);
    return {
      jobsCreated: stats.jobsCreated,
      jobsApproved: stats.jobsApproved,
      jobsRejected: stats.jobsRejected,
      disputesLost: stats.disputesLost,
      disputesWon: stats.disputesWon,
      totalPaid: stats.totalPaid,
      totalRefunded: stats.totalRefunded,
      totalBondSlashed: stats.totalBondSlashed
    };
  });
}

export async function getClientScore(address: `0x${string}`, network?: ArcPilotNetwork) {
  return loggedOperation("sdk.clients", "getClientScore", { clientAddress: address, network }, () =>
    getSdkContracts(undefined, network).ClientRegistry.getClientScore(address) as Promise<bigint>
  );
}
