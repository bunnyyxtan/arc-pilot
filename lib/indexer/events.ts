import type { Contract } from "ethers";
import { getSdkContracts, type ArcPilotNetwork } from "../sdk/arcpilot";
import { logger } from "../logger";

// Indexer core: reads real contract logs and normalizes event args before SDK state hydration.
export type IndexedEvent = {
  contract: string;
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  args: Record<string, unknown>;
};

function eventArgsToObject(args: unknown, inputs: Array<{ name: string }> = []): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const raw = args as Record<string, unknown>;
  const maybeResult = args as { getValue?: (name: string) => unknown };

  for (const input of inputs) {
    if (!input.name) {
      continue;
    }
    if (typeof maybeResult.getValue === "function") {
      result[input.name] = maybeResult.getValue(input.name);
    } else if (input.name in raw) {
      result[input.name] = raw[input.name];
    }
  }

  for (const key of Object.keys(raw)) {
    if (!/^\d+$/.test(key)) {
      result[key] = raw[key];
    }
  }
  return result;
}

export async function readEvents(contract: Contract, contractName: string, eventNames: string[], fromBlock = 0): Promise<IndexedEvent[]> {
  const events: IndexedEvent[] = [];
  const dynamicContract = contract as unknown as {
    filters: Record<string, () => unknown>;
    queryFilter: (filter: unknown, fromBlock: number) => Promise<unknown[]>;
  };

  for (const eventName of eventNames) {
    logger.info("indexer.events", "eventScan:start", { contractName, eventName, fromBlock }, "Scanning contract events");
    const filter = dynamicContract.filters[eventName]?.();
    if (!filter) {
      logger.warn("indexer.events", "eventScan:missingFilter", { contractName, eventName }, "Event filter is not available on contract ABI");
      continue;
    }
    let logs: unknown[];
    try {
      logs = await dynamicContract.queryFilter(filter, fromBlock);
    } catch (error) {
      logger.error("indexer.events", "eventScan:failed", { contractName, eventName, fromBlock, error }, "Event query failed");
      throw error;
    }
    logger.info("indexer.events", "eventScan:success", { contractName, eventName, fromBlock, eventCount: logs.length }, "Event scan completed");
    for (const log of logs) {
      const eventLog = log as {
        fragment?: { name: string; inputs?: Array<{ name: string }> };
        blockNumber: number;
        transactionHash: string;
        args?: unknown;
      };
      events.push({
        contract: contractName,
        eventName: eventLog.fragment?.name ?? eventName,
        blockNumber: eventLog.blockNumber,
        transactionHash: eventLog.transactionHash,
        args: eventArgsToObject(eventLog.args ?? {}, eventLog.fragment?.inputs ?? [])
      });
    }
  }

  if (events.length === 0) {
    logger.info("indexer.events", "eventScan:empty", { contractName, eventNames, fromBlock }, "No events found");
  }
  return events.sort((a, b) => a.blockNumber - b.blockNumber || a.transactionHash.localeCompare(b.transactionHash));
}

export function getIndexerContracts(network?: ArcPilotNetwork) {
  logger.debug("indexer.events", "contracts:load", { network }, "Loading indexer contract bindings");
  return getSdkContracts(undefined, network);
}
