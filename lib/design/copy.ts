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

export function formatScore(score: bigint | string | number): string {
  return Number(score).toString();
}

export function getTierForScore(score: bigint | number): string {
  const s = Number(score);
  if (s >= 800) return "Prime";
  if (s >= 650) return "Reliable";
  if (s >= 500) return "Moderate";
  if (s >= 300) return "Risky";
  return "High Risk";
}

export function getTierColor(tier: string): string {
  switch (tier) {
    case "Prime": return "bg-success/10 text-success border-success/20";
    case "Reliable": return "bg-info/10 text-info border-info/20";
    case "Moderate": return "bg-warning/10 text-warning border-warning/20";
    case "Risky": return "bg-danger/10 text-danger border-danger/20";
    case "High Risk": return "bg-danger/20 text-danger font-bold border-danger/40";
    default: return "bg-slate-500/10 text-slate-400 border-slate-500/20";
  }
}
