const KNOWN_DEPLOYER_ADMIN_WALLET = "0x836BEEa5C4382196393C5DF8bA345E09F7b20Bd4";

export function normalizeWallet(address?: string | null): string | null {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address.trim())
    ? address.trim().toLowerCase()
    : null;
}

function fallbackDisabled() {
  return process.env.ARC_RESOLVER_ADMIN_DISABLE_FALLBACK?.trim().toLowerCase() === "true";
}

export function getResolverAdminWallets(): string[] {
  const configuredWallets = (process.env.ARC_RESOLVER_ADMIN_WALLETS || "")
    .split(",")
    .map((wallet) => normalizeWallet(wallet))
    .filter((wallet): wallet is string => Boolean(wallet));
  const fallbackWallet = normalizeWallet(KNOWN_DEPLOYER_ADMIN_WALLET);
  const wallets = fallbackDisabled() || !fallbackWallet
    ? configuredWallets
    : [...configuredWallets, fallbackWallet];
  return [...new Set(wallets)];
}

export function isResolverAdminWallet(address?: string | null): boolean {
  const wallet = normalizeWallet(address);
  return Boolean(wallet && getResolverAdminWallets().includes(wallet));
}
