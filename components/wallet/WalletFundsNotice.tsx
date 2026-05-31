"use client";

import { useBalance, useReadContract } from "wagmi";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { erc20Abi } from "../../lib/contracts/browser-abis";
import { getBrowserContractAddresses } from "../../lib/contracts/browser-addresses";
import { useArcWallet } from "../../lib/contracts/hooks";

export function WalletFundsNotice() {
  const wallet = useArcWallet();
  const addresses = getBrowserContractAddresses();
  const { data: native } = useBalance({ address: wallet.address, chainId: arcTestnet.id, query: { enabled: Boolean(wallet.address) } });
  const { data: token } = useReadContract({
    address: addresses?.USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: wallet.address ? [wallet.address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(addresses?.USDC && wallet.address) }
  });

  if (!wallet.isConnected || native === undefined || token === undefined || (native.value > 0n && token > 0n)) return null;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-[13px] leading-5 text-warning">
      You need Arc Testnet USDC for gas and payments.
    </div>
  );
}

