import { ethers } from "ethers";

export function parseUsdc(value: string | number | bigint) {
  if (typeof value === "bigint") {
    return value;
  }
  return ethers.parseUnits(String(value), 6);
}

export function formatUsdc(value: bigint) {
  return ethers.formatUnits(value, 6);
}

export function formatUSDC(value: bigint | string | number | undefined | null, options?: { compact?: boolean; fallback?: string }) {
  if (value === undefined || value === null || value === "") {
    return options?.fallback ?? "0.00 USDC";
  }

  let units: string;
  try {
    if (typeof value === "bigint") {
      units = ethers.formatUnits(value, 6);
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) return options?.fallback ?? "0.00 USDC";
      units = ethers.formatUnits(BigInt(Math.trunc(value)), 6);
    } else if (/^-?\d+$/.test(value)) {
      units = ethers.formatUnits(BigInt(value), 6);
    } else {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return options?.fallback ?? "0.00 USDC";
      units = String(parsed);
    }
  } catch {
    return options?.fallback ?? "0.00 USDC";
  }

  const numeric = Number(units);
  if (!Number.isFinite(numeric)) {
    return options?.fallback ?? "0.00 USDC";
  }

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: options?.compact ? 2 : 6
  }).format(numeric);

  return `${formatted} USDC`;
}

export function usdcToNumber(value: bigint | string | number | undefined | null) {
  if (value === undefined || value === null || value === "") return 0;
  try {
    if (typeof value === "bigint") return Number(ethers.formatUnits(value, 6));
    if (typeof value === "number") return Number.isFinite(value) ? Number(ethers.formatUnits(BigInt(Math.trunc(value)), 6)) : 0;
    if (/^-?\d+$/.test(value)) return Number(ethers.formatUnits(BigInt(value), 6));
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}
