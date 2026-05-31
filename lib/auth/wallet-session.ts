import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeWallet } from "../deliverables/access";

export const WALLET_SESSION_COOKIE = "arcpilot_wallet_session";
export const WALLET_NONCE_COOKIE = "arcpilot_wallet_nonce";
export const WALLET_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
export const WALLET_NONCE_MAX_AGE_SECONDS = 60 * 5;

type SessionPayload = {
  wallet: string;
  chainId: 5042002;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
};

function sessionSecret() {
  return process.env.ARC_WALLET_SESSION_SECRET || "";
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireWalletSessionSecret() {
  const secret = sessionSecret();
  if (secret.length < 32) {
    throw new Error("ARC_WALLET_SESSION_SECRET is missing or too short. Configure a server-only secret with at least 32 characters.");
  }
  return secret;
}

export function createWalletNonce() {
  return randomBytes(24).toString("base64url");
}

export function createWalletSessionToken(wallet: string, secret = requireWalletSessionSecret()) {
  const normalized = normalizeWallet(wallet);
  if (!normalized) throw new Error("Wallet address is invalid.");
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    wallet: normalized,
    chainId: 5042002,
    issuedAt,
    expiresAt: issuedAt + WALLET_SESSION_MAX_AGE_SECONDS,
    sessionId: randomBytes(18).toString("base64url")
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${hmac(encoded, secret)}`;
}

export function verifyWalletSessionToken(token: string, secret = sessionSecret()) {
  if (!token || secret.length < 32) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || !signaturesMatch(hmac(encoded, secret), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (payload.chainId !== 5042002 || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    const wallet = normalizeWallet(payload.wallet);
    return wallet ? { ...payload, wallet } : null;
  } catch {
    return null;
  }
}

export function getVerifiedWalletFromRequest(request: Request) {
  return verifyWalletSessionToken(cookieValue(request, WALLET_SESSION_COOKIE))?.wallet ?? null;
}

export function getWalletNonceFromRequest(request: Request) {
  return cookieValue(request, WALLET_NONCE_COOKIE);
}

export function walletCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  };
}
