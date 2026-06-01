import { normalizeWallet } from "../deliverables/access";

export const RESOLVER_ADMIN_WALLET = "0x836BEEa5C4382196393C5DF8bA345E09F7b20Bd4";

export function isResolverAdminWallet(wallet: unknown) {
  return normalizeWallet(typeof wallet === "string" ? wallet : null) === RESOLVER_ADMIN_WALLET.toLowerCase();
}
