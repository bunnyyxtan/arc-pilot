"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { ARC_TESTNET_EXPLORER_URL, ARC_TESTNET_RPC_URL, arcTestnet } from "../../lib/chains/arc-testnet";
import { getBrowserContractAddresses, getMissingBrowserContracts } from "../../lib/contracts/browser-addresses";
import { shortenAddress } from "../../lib/design/copy";
import { Card } from "../../components/ui/Card";
import { Section } from "../../components/ui/Section";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-6 border-b border-borderDark py-3 last:border-b-0"><span className="text-label">{label}</span><span className="mono-value break-all text-right text-[12px] leading-5 text-slate-300">{value}</span></div>;
}

export default function EngineStatus() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const addresses = getBrowserContractAddresses();
  const missing = getMissingBrowserContracts();
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    publicClient?.getBlockNumber()
      .then((number) => { if (active) setBlockNumber(number); })
      .catch(() => { if (active) setRpcError("Arc Testnet RPC is not responding."); });
    return () => { active = false; };
  }, [publicClient]);

  return (
    <div className="flex flex-col gap-10 animate-fadeInUp">
      <div className="relative border-b border-borderDark/60 pb-8">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-info/30 to-transparent"></div>
        <h1 className="lux-heading text-[36px] tracking-[-0.03em]">Arc Testnet Status</h1>
        <p className="lux-copy mt-2 max-w-2xl text-[15px] text-slate-400">Inspect the configured public deployment, wallet network, and latest readable Arc Testnet block.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md"><div className="text-label">RPC Status</div><div className={`mt-3 font-heading text-[26px] ${rpcError ? "text-danger" : "text-success"}`}>{rpcError ? "Unavailable" : blockNumber === null ? "Checking..." : "Reachable"}</div></Card>
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md"><div className="text-label">Latest Block</div><div className="mono-value mt-3 text-[24px] text-white">{blockNumber === null ? "Pending" : `#${blockNumber}`}</div></Card>
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md"><div className="text-label">Deployment</div><div className={`mt-3 font-heading text-[26px] ${missing.length ? "text-warning" : "text-success"}`}>{missing.length ? "Needs Setup" : "Configured"}</div></Card>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Arc Testnet Network">
          <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
            <Row label="Chain ID" value={arcTestnet.id} />
            <Row label="RPC" value={ARC_TESTNET_RPC_URL} />
            <Row label="Explorer" value={<a className="text-accent underline underline-offset-4" href={ARC_TESTNET_EXPLORER_URL} target="_blank" rel="noreferrer">testnet.arcscan.app</a>} />
            <Row label="Native Currency" value="USDC" />
            <Row label="Wallet Network" value={!isConnected ? "Wallet disconnected" : chainId === arcTestnet.id ? "Arc Testnet" : `Wrong chain: ${chainId}`} />
            <Row label="Wallet" value={address ? shortenAddress(address) : "Not connected"} />
          </Card>
        </Section>
        <Section title="Public Contracts">
          <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
            {addresses ? Object.entries(addresses).map(([name, value]) => <Row key={name} label={name} value={value} />) : <div className="text-[13px] leading-6 text-warning">Arc Testnet contracts not configured.</div>}
          </Card>
        </Section>
      </div>
    </div>
  );
}

