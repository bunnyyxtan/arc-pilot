import { NextResponse } from "next/server";
import { buildWalletSignInMessage } from "../../../../lib/auth/message";
import { createWalletNonce, WALLET_NONCE_COOKIE, WALLET_NONCE_MAX_AGE_SECONDS, walletCookieOptions } from "../../../../lib/auth/wallet-session";
import { normalizeWallet } from "../../../../lib/deliverables/access";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const address = normalizeWallet(typeof body.address === "string" ? body.address : "");
  if (!address) {
    return NextResponse.json({ ok: false, error: "A valid wallet address is required." }, { status: 400 });
  }
  const nonce = createWalletNonce();
  const response = NextResponse.json({ ok: true, nonce, message: buildWalletSignInMessage(address, nonce) });
  response.cookies.set(WALLET_NONCE_COOKIE, nonce, walletCookieOptions(WALLET_NONCE_MAX_AGE_SECONDS));
  return response;
}
