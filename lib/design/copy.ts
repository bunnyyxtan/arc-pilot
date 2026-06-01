export function shortenAddress(address: string | undefined): string {
  if (!address || address === "0x0000000000000000000000000000000000000000") return "Not Set";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatUsd(amount: bigint | string | number): string {
  let value: number;
  if (typeof amount === "bigint") {
    value = Number(amount) / 1_000_000;
  } else if (typeof amount === "string" && /^-?\d+$/.test(amount) && Math.abs(Number(amount)) >= 1_000_000) {
    value = Number(amount) / 1_000_000;
  } else {
    value = Number(amount);
  }
  if (!Number.isFinite(value)) return "0.00 USDC";
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
