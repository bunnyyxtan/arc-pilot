export const ARC_AUTH_CHAIN_ID = 5042002;

export function buildWalletSignInMessage(address: string, nonce: string) {
  return [
    "Sign in to ArcPilot",
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Chain ID: ${ARC_AUTH_CHAIN_ID}`
  ].join("\n");
}
