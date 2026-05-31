"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import type { Hash } from "viem";
import { arcTestnet } from "../chains/arc-testnet";

export type TxPhase = "idle" | "pending" | "confirming" | "success" | "error";

export type TxState = {
  phase: TxPhase;
  label?: string;
  hash?: Hash;
  error?: string;
};

export function useArcWallet() {
  const account = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const correctNetwork = account.isConnected && chainId === arcTestnet.id;

  return {
    ...account,
    chainId,
    correctNetwork,
    isSwitching,
    switchToArc: () => switchChainAsync({ chainId: arcTestnet.id })
  };
}

export function useArcTransaction() {
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const wallet = useArcWallet();
  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const reset = useCallback(() => setTx({ phase: "idle" }), []);

  const run = useCallback(
    async (label: string, request: Parameters<typeof writeContractAsync>[0]) => {
      if (!wallet.isConnected) {
        setTx({ phase: "error", label, error: "Connect Wallet to continue." });
        return null;
      }
      if (!wallet.correctNetwork) {
        setTx({ phase: "error", label, error: "Switch to Arc Testnet to continue." });
        return null;
      }
      if (!publicClient) {
        setTx({ phase: "error", label, error: "Arc Testnet RPC is unavailable." });
        return null;
      }

      try {
        setTx({ phase: "pending", label });
        const hash = await writeContractAsync(request);
        setTx({ phase: "confirming", label, hash });
        await publicClient.waitForTransactionReceipt({ hash });
        setTx({ phase: "success", label, hash });
        return hash;
      } catch (error) {
        setTx({
          phase: "error",
          label,
          error: error instanceof Error ? error.message : "Transaction failed."
        });
        return null;
      }
    },
    [publicClient, wallet.correctNetwork, wallet.isConnected, writeContractAsync]
  );

  return { tx, run, reset, wallet };
}

