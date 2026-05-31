import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { buildWalletSignInMessage } from "../../../../lib/auth/message";
import {
  createWalletSessionToken,
  getWalletNonceFromRequest,
  requireWalletSessionSecret,
  WALLET_NONCE_COOKIE,
  WALLET_SESSION_COOKIE,
  WALLET_SESSION_MAX_AGE_SECONDS,
  walletCookieOptions
} from "../../../../lib/auth/wallet-session";
import { normalizeWallet } from "../../../../lib/deliverables/access";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const address = normalizeWallet(typeof body.address === "string" ? body.address : "");
    const signature = typeof body.signature === "string" ? body.signature : "";
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const cookieNonce = getWalletNonceFromRequest(request);
    if (!address || !signature || !nonce || !cookieNonce || nonce !== cookieNonce) {
      return NextResponse.json({ ok: false, error: "Wallet sign-in challenge is invalid or expired. Request a new signature." }, { status: 400 });
    }
    const valid = await verifyMessage({ address: address as `0x${string}`, message: buildWalletSignInMessage(address, nonce), signature: signature as `0x${string}` });
    if (!valid) {
      return NextResponse.json({ ok: false, error: "Wallet signature verification failed." }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, verifiedWallet: address });
    response.cookies.set(WALLET_SESSION_COOKIE, createWalletSessionToken(address, requireWalletSessionSecret()), walletCookieOptions(WALLET_SESSION_MAX_AGE_SECONDS));
    response.cookies.set(WALLET_NONCE_COOKIE, "", walletCookieOptions(0));
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Wallet sign-in failed." }, { status: 500 });
  }
}
