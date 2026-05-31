"use client";

import { ARC_TESTNET_EXPLORER_URL } from "../../lib/chains/arc-testnet";
import type { TxState } from "../../lib/contracts/hooks";

export function TxStatus({ tx }: { tx: TxState }) {
  if (tx.phase === "idle") return null;
  const tone = tx.phase === "error" ? "border-danger/30 bg-danger/5 text-danger" : tx.phase === "success" ? "border-success/30 bg-success/5 text-success" : "border-accent/30 bg-accent/5 text-accent";

  return (
    <div className={`rounded-xl border p-4 text-[13px] leading-5 ${tone}`}>
      <div className="font-medium">
        {tx.phase === "pending" && `${tx.label}: confirm in wallet`}
        {tx.phase === "confirming" && `${tx.label}: pending on Arc Testnet`}
        {tx.phase === "success" && `${tx.label}: confirmed`}
        {tx.phase === "error" && `${tx.label || "Transaction"}: ${tx.error}`}
      </div>
      {tx.hash && (
        <a
          className="mono-value mt-2 block break-all text-[12px] underline decoration-current/40 underline-offset-4"
          href={`${ARC_TESTNET_EXPLORER_URL}/tx/${tx.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          {tx.hash}
        </a>
      )}
    </div>
  );
}

