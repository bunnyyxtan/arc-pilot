"use client";

import { useEffect, useMemo, useState } from "react";
import type { Connector } from "wagmi";
import { requestWalletProviders } from "../../lib/wallet/eip6963";

type WalletSelectionModalProps = {
  connectors: readonly Connector[];
  error?: string;
  isConnecting: boolean;
  onClose: () => void;
  onConnect: (connector: Connector) => void;
};

type WalletOption = {
  connector?: Connector;
  description: string;
  id: string;
  initials: string;
  label: string;
  tone: string;
};

const EXPECTED_WALLETS = [
  { id: "metaMask", label: "MetaMask", description: "Connect with the MetaMask browser extension.", initials: "M", tone: "from-[#f6851b]/30 to-[#e2761b]/10" },
  { id: "rabby", label: "Rabby Wallet", description: "Connect with Rabby's browser extension.", initials: "R", tone: "from-[#7c6cff]/30 to-[#5b4bdb]/10" },
  { id: "okxWallet", label: "OKX Wallet", description: "Connect with the OKX browser extension.", initials: "O", tone: "from-white/20 to-white/[0.03]" },
  { id: "injected", label: "Injected Wallet", description: "Use the browser's default injected wallet.", initials: "I", tone: "from-accent/25 to-accent/[0.04]" }
] as const;

function connectorMatches(connector: Connector, id: string) {
  const value = `${connector.id} ${connector.name} ${connector.rdns || ""}`.toLowerCase();
  if (id === "metaMask") return value.includes("metamask");
  if (id === "rabby") return value.includes("io.rabby") || value.includes("rabby");
  if (id === "okxWallet") return value.includes("com.okex.wallet") || value.includes("okx") || value.includes("okex");
  return connector.id === "injected";
}

function connectorPriority(connector: Connector, id: string) {
  const rdns = String(connector.rdns || "").toLowerCase();
  if (id === "rabby" && rdns.includes("io.rabby")) return 0;
  if (id === "okxWallet" && rdns.includes("com.okex.wallet")) return 0;
  if (id === "metaMask" && rdns.includes("io.metamask")) return 0;
  return connector.id === id ? 1 : 2;
}

function WalletCard({
  option,
  available,
  isConnecting,
  onConnect
}: {
  option: WalletOption;
  available: boolean;
  isConnecting: boolean;
  onConnect: (connector: Connector) => void;
}) {
  const connector = option.connector;
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-4 rounded-xl border border-borderDark bg-white/[0.025] p-4 text-left transition-all duration-300 enabled:hover:border-accent/35 enabled:hover:bg-white/[0.055] enabled:hover:shadow-glow-sm disabled:cursor-not-allowed disabled:opacity-60"
      disabled={!connector || !available || isConnecting}
      onClick={() => connector && onConnect(connector)}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-borderLight/30 bg-gradient-to-br ${option.tone} font-heading text-[16px] font-medium text-white shadow-depth-sm`}>
        {connector?.icon ? <img className="h-full w-full object-cover" alt="" src={connector.icon} /> : option.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[15px] font-medium text-white">{option.label}</div>
        <div className="mt-1 text-[12px] leading-5 text-slate-500">{option.description}</div>
      </div>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.16em] ${available ? "border-success/25 bg-success/10 text-success" : "border-borderLight/30 bg-white/[0.025] text-slate-500"}`}>
        {available ? "Available" : "Not installed"}
      </span>
    </button>
  );
}

export function WalletSelectionModal({ connectors, error, isConnecting, onClose, onConnect }: WalletSelectionModalProps) {
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  const options = useMemo(() => {
    const expected: WalletOption[] = EXPECTED_WALLETS.map((wallet) => ({
      ...wallet,
      connector: connectors
        .filter((connector) => connectorMatches(connector, wallet.id))
        .sort((left, right) => connectorPriority(left, wallet.id) - connectorPriority(right, wallet.id))[0]
    }));
    const discovered: WalletOption[] = connectors
      .filter((connector) => !EXPECTED_WALLETS.some((wallet) => connectorMatches(connector, wallet.id)))
      .map((connector) => ({
        connector,
        description: "Detected browser wallet provider.",
        id: connector.uid,
        initials: connector.name.slice(0, 1).toUpperCase(),
        label: connector.name,
        tone: "from-success/20 to-success/[0.04]"
      }));
    return [...expected, ...discovered];
  }, [connectors]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function probe() {
      const entries = await Promise.all(options.map(async (option) => {
        if (!option.connector) return [option.id, false] as const;
        try {
          return [option.id, Boolean(await option.connector.getProvider())] as const;
        } catch {
          return [option.id, false] as const;
        }
      }));
      if (active) setAvailability(Object.fromEntries(entries));
    }
    function refreshAfterAnnouncement() {
      window.clearTimeout(timer);
      timer = window.setTimeout(probe, 40);
    }
    window.addEventListener("eip6963:announceProvider", refreshAfterAnnouncement);
    requestWalletProviders();
    void probe();
    timer = window.setTimeout(probe, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", refreshAfterAnnouncement);
    };
  }, [options]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[90] flex items-start justify-center bg-black/60 px-4 pt-20 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-borderLight/30 bg-[#080d19]/95 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.58),0_0_45px_rgba(147,197,253,0.08)]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between border-b border-borderDark pb-4">
          <div>
            <h2 className="font-heading text-[20px] font-medium text-white">Connect Wallet</h2>
            <p className="mt-1 text-[13px] leading-5 text-slate-500">Choose a browser wallet to use on Arc Testnet.</p>
          </div>
          <button type="button" className="glass-button flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-white" onClick={onClose} aria-label="Close wallet selection">x</button>
        </div>
        <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
          {options.map((option) => <WalletCard key={option.id} option={option} available={Boolean(availability[option.id])} isConnecting={isConnecting} onConnect={onConnect} />)}
          <button type="button" className="flex w-full cursor-not-allowed items-center gap-4 rounded-xl border border-borderDark bg-white/[0.015] p-4 text-left opacity-60" disabled>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-borderLight/30 bg-white/[0.03] font-heading text-[16px] text-slate-400">+</div>
            <div className="min-w-0 flex-1"><div className="font-heading text-[15px] font-medium text-white">Other Wallets</div><div className="mt-1 text-[12px] leading-5 text-slate-500">WalletConnect project ID not configured.</div></div>
            <span className="rounded-full border border-borderLight/30 bg-white/[0.025] px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">Unavailable</span>
          </button>
        </div>
        {isConnecting && <div className="mt-4 rounded-xl border border-accent/25 bg-accent/5 p-3 text-[12px] leading-5 text-accent">Connecting... approve the request in your selected wallet.</div>}
        {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-[12px] leading-5 text-danger">{error}</div>}
      </div>
    </div>
  );
}
