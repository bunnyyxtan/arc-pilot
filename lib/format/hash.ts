import { ethers } from "ethers";

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}

export function keccak256Stable(value: unknown): `0x${string}` {
  return ethers.keccak256(ethers.toUtf8Bytes(stableJsonStringify(value))) as `0x${string}`;
}
