import { NextResponse } from "next/server";
import { getVerifiedWalletFromRequest } from "../../../../lib/auth/wallet-session";

export async function GET(request: Request) {
  const verifiedWallet = getVerifiedWalletFromRequest(request);
  return NextResponse.json({ ok: true, verified: Boolean(verifiedWallet), verifiedWallet });
}
