import { NextResponse } from "next/server";
import { WALLET_NONCE_COOKIE, WALLET_SESSION_COOKIE, walletCookieOptions } from "../../../../lib/auth/wallet-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(WALLET_SESSION_COOKIE, "", walletCookieOptions(0));
  response.cookies.set(WALLET_NONCE_COOKIE, "", walletCookieOptions(0));
  return response;
}
