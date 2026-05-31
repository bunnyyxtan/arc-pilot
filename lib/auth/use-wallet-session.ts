"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { ARC_AUTH_CHAIN_ID } from "./message";

export const WALLET_SESSION_CHANGED_EVENT = "arcpilot:wallet-session-changed";

type WalletSessionState = {
  verified: boolean;
  verifiedWallet: string | null;
};

export function announceWalletSessionChange() {
  window.dispatchEvent(new CustomEvent(WALLET_SESSION_CHANGED_EVENT));
}

export function useWalletSession() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<WalletSessionState>({ verified: false, verifiedWallet: null });
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await response.json() as WalletSessionState;
      setSession({ verified: Boolean(data.verified), verifiedWallet: data.verifiedWallet || null });
    } catch {
      setSession({ verified: false, verifiedWallet: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [address, refresh]);
  useEffect(() => {
    const handleChange = () => refresh();
    window.addEventListener(WALLET_SESSION_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(WALLET_SESSION_CHANGED_EVENT, handleChange);
  }, [refresh]);

  const signIn = useCallback(async () => {
    if (!address || !isConnected) throw new Error("Connect Wallet before verifying the session.");
    if (chainId !== ARC_AUTH_CHAIN_ID) throw new Error("Switch to Arc Testnet before verifying the session.");
    setSigning(true);
    setError(null);
    try {
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address })
      });
      const challenge = await nonceResponse.json();
      if (!nonceResponse.ok || !challenge.nonce || !challenge.message) {
        throw new Error(challenge.error || "Unable to create wallet sign-in challenge.");
      }
      const signature = await signMessageAsync({ message: challenge.message });
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, nonce: challenge.nonce, signature })
      });
      const verified = await verifyResponse.json();
      if (!verifyResponse.ok || !verified.verifiedWallet) {
        throw new Error(verified.error || "Wallet signature verification failed.");
      }
      await refresh();
      announceWalletSessionChange();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Wallet sign-in failed.");
      throw signInError;
    } finally {
      setSigning(false);
    }
  }, [address, chainId, isConnected, refresh, signMessageAsync]);

  const logout = useCallback(async () => {
    setError(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSession({ verified: false, verifiedWallet: null });
      announceWalletSessionChange();
    }
  }, []);

  const matchesConnectedWallet = Boolean(address && session.verifiedWallet && address.toLowerCase() === session.verifiedWallet.toLowerCase());

  return { ...session, loading, signing, error, matchesConnectedWallet, signIn, logout, refresh };
}
