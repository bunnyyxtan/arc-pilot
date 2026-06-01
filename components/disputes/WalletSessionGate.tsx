"use client";

import { useWalletSession } from "../../lib/auth/use-wallet-session";
import { useArcWallet } from "../../lib/contracts/hooks";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function WalletSessionGate({ children, message }: { children: React.ReactNode; message?: string }) {
  const wallet = useArcWallet();
  const walletSession = useWalletSession();

  if (!wallet.isConnected) {
    return (
      <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
        <p className="text-[14px] leading-7 text-slate-400">Connect a wallet to continue.</p>
      </Card>
    );
  }

  if (!wallet.correctNetwork) {
    return (
      <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
        <p className="text-[14px] leading-7 text-slate-400">Switch to Arc Testnet to continue.</p>
      </Card>
    );
  }

  if (!walletSession.matchesConnectedWallet) {
    return (
      <Card className="border-accent/20 bg-accent/[0.035] p-7 shadow-depth-md">
        <p className="text-[14px] leading-7 text-slate-400">
          {message || "Verify wallet session before continuing."}
        </p>
        {walletSession.error && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-6 text-danger">
            {walletSession.error}
          </div>
        )}
        <Button
          className="mt-5"
          onClick={() => void walletSession.signIn().catch(() => undefined)}
          disabled={walletSession.signing || !wallet.correctNetwork}
        >
          {walletSession.signing ? "Verifying..." : "Verify Wallet Session"}
        </Button>
      </Card>
    );
  }

  return <>{children}</>;
}
