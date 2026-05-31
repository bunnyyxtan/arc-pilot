"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { formatUnits } from "viem";
import { ARC_TESTNET_EXPLORER_URL, ARC_TESTNET_RPC_URL, arcTestnet } from "../../lib/chains/arc-testnet";
import { useWalletSession } from "../../lib/auth/use-wallet-session";
import { getBrowserContractAddresses, getMissingBrowserContracts } from "../../lib/contracts/browser-addresses";
import { shortenAddress } from "../../lib/design/copy";
import { NAVIGATION_LINKS } from "../../lib/design/navigation";
import { ArcPilotLogo } from "../brand/ArcPilotLogo";
import { WalletSelectionModal } from "../wallet/WalletSelectionModal";

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-[80] flex items-start justify-center bg-black/50 px-4 pt-24 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-borderLight/30 bg-[#080d19]/95 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.55)]" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between border-b border-borderDark pb-4">
          <h2 className="font-heading text-lg font-medium text-white">{title}</h2>
          <button className="glass-button h-8 w-8 rounded-full text-slate-400 hover:text-white" onClick={onClose} aria-label="Close modal">x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-borderDark/70 py-3 last:border-b-0">
      <span className="text-label">{label}</span>
      <span className="max-w-[70%] break-all text-right text-[13px] leading-5 text-slate-300">{value}</span>
    </div>
  );
}

export function NavigationBar() {
  const pathname = usePathname();
  const [modal, setModal] = useState<"walletSelect" | "network" | "settings" | null>(null);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connectAsync, isPending: isConnecting, error: connectError, reset: resetConnect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const walletSession = useWalletSession();
  const addresses = getBrowserContractAddresses();
  const missingContracts = getMissingBrowserContracts();
  const wrongNetwork = isConnected && chainId !== arcTestnet.id;
  const { data: nativeBalance } = useBalance({ address, chainId: arcTestnet.id, query: { enabled: Boolean(address) } });

  function openWalletSelector() {
    resetConnect();
    setWalletMenuOpen(false);
    setModal("walletSelect");
  }

  async function connectWallet(connector: Connector) {
    try {
      await connectAsync({ connector, chainId: arcTestnet.id });
      setModal(null);
    } catch {
      // wagmi exposes the wallet error inside the selection modal.
    }
  }

  async function disconnectWallet() {
    await walletSession.logout();
    disconnect();
    setWalletMenuOpen(false);
    setModal(null);
  }

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function switchToArcTestnet() {
    switchChain(
      { chainId: arcTestnet.id },
      { onError: () => setModal("network") }
    );
  }

  return (
    <header className="pointer-events-none fixed left-0 right-0 top-4 z-50 flex justify-center px-4 md:top-6">
      <div className="pointer-events-auto flex w-full max-w-[1600px] items-center justify-between rounded-[32px] border border-borderLight/20 bg-[#080d19]/70 px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-3xl transition-all duration-300">
        <div className="flex shrink-0 items-center pl-3"><ArcPilotLogo /></div>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center justify-center gap-1 rounded-full border border-borderDark/40 bg-black/20 p-1 shadow-depth-inset lg:flex">
          {NAVIGATION_LINKS.map((link) => {
            const active = pathname === link.href || pathname?.startsWith(link.href + "/");
            return (
              <Link key={link.href} href={link.href} className={`relative rounded-full px-4 py-1.5 text-[13px] font-[520] transition-all duration-300 ${active ? "border border-accent/20 bg-accent/10 text-accent shadow-glow" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-3 pr-1">
          <button className="hidden items-center gap-2 rounded-full border border-borderDark bg-black/30 px-3 py-1.5 shadow-depth-inset transition-colors hover:border-borderLight hover:bg-white/[0.04] md:flex" onClick={() => setModal("network")}>
            <span className={`h-1.5 w-1.5 rounded-full ${missingContracts.length ? "bg-warning" : "bg-success animate-liveIndicator shadow-glow-success"}`}></span>
            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-300">Arc Testnet</span>
          </button>
          <button className="flex h-9 w-9 items-center justify-center rounded-full border border-borderDark bg-white/[0.04] text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white" onClick={() => setModal("settings")} aria-label="Open system settings">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.18V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7.1 19.73l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.09 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.27 7.1l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.9 1.18l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.91 10H21a2 2 0 0 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" /></svg>
          </button>
          {!isConnected ? (
            <button className="flex h-9 items-center justify-center rounded-full border border-accent/20 bg-accent/10 px-4 text-[12px] font-medium text-accent shadow-glow-sm transition-all hover:bg-accent/20" onClick={openWalletSelector}>
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          ) : wrongNetwork ? (
            <button className="flex h-9 items-center justify-center rounded-full border border-warning/30 bg-warning/10 px-4 text-[12px] font-medium text-warning" onClick={switchToArcTestnet}>
              {isSwitching ? "Switching..." : "Switch to Arc Testnet"}
            </button>
          ) : (
            <button className="mono-value flex h-9 items-center justify-center rounded-full border border-success/20 bg-success/10 px-4 text-[12px] font-medium text-success" onClick={() => setWalletMenuOpen((open) => !open)}>{shortenAddress(address)}</button>
          )}
        </div>
      </div>
      {walletMenuOpen && isConnected && (
        <div className="pointer-events-auto fixed right-4 top-[74px] z-[75] w-[300px] rounded-2xl border border-borderLight/30 bg-[#080d19]/95 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl md:right-6 md:top-[86px]">
          <div className="border-b border-borderDark px-2 pb-3">
            <div className="text-label">Connected Wallet</div>
            <div className="mono-value mt-2 text-[13px] text-white">{shortenAddress(address)}</div>
            <div className="mt-1 text-[12px] text-slate-500">Arc Testnet / {nativeBalance ? `${formatUnits(nativeBalance.value, nativeBalance.decimals)} ${nativeBalance.symbol}` : "Loading balance..."}</div>
            <div className={`mt-2 text-[11px] ${walletSession.matchesConnectedWallet ? "text-success" : "text-warning"}`}>
              {walletSession.matchesConnectedWallet ? "Verified wallet session" : "Protected reports require wallet verification"}
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {!walletSession.matchesConnectedWallet && (
              <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-accent transition-colors hover:bg-accent/10" onClick={() => walletSession.signIn().catch(() => undefined)} disabled={walletSession.signing}>
                {walletSession.signing ? "Waiting For Signature..." : "Verify Wallet Session"}
              </button>
            )}
            {walletSession.matchesConnectedWallet && (
              <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white" onClick={() => walletSession.logout()}>
                Sign Out Protected Session
              </button>
            )}
            <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white" onClick={copyAddress}>{copied ? "Address Copied" : "Copy Address"}</button>
            <a className="block rounded-lg px-3 py-2 text-[13px] text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white" href={`${ARC_TESTNET_EXPLORER_URL}/address/${address}`} target="_blank" rel="noreferrer">View On ArcScan</a>
            <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white" onClick={() => { setWalletMenuOpen(false); setModal("network"); }}>Network Details</button>
            <button type="button" className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger/10" onClick={disconnectWallet}>Disconnect</button>
          </div>
          {walletSession.error && <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 p-3 text-[12px] leading-5 text-danger">{walletSession.error}</div>}
        </div>
      )}
      {modal === "walletSelect" && (
        <WalletSelectionModal connectors={connectors} error={connectError?.message} isConnecting={isConnecting} onClose={() => setModal(null)} onConnect={connectWallet} />
      )}
      {modal === "network" && (
        <Modal title="Network Status" onClose={() => setModal(null)}>
          <div className="rounded-xl border border-borderDark bg-black/30 p-4">
            <StatusRow label="Network" value="Arc Testnet" />
            <StatusRow label="Chain ID" value={<span className="mono-value">{arcTestnet.id}</span>} />
            <StatusRow label="RPC" value={<span className="mono-value">{ARC_TESTNET_RPC_URL}</span>} />
            <StatusRow label="Currency Symbol" value="USDC" />
            <StatusRow label="Explorer" value={<a className="text-accent underline underline-offset-4" href={ARC_TESTNET_EXPLORER_URL} target="_blank" rel="noreferrer">testnet.arcscan.app</a>} />
            <StatusRow label="USDC" value={<span className="mono-value">{addresses?.USDC || "Not configured"}</span>} />
            <StatusRow label="Contracts" value={missingContracts.length ? `Missing: ${missingContracts.join(", ")}` : "Arc Testnet deployment configured"} />
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="System Settings" onClose={() => setModal(null)}>
          <div className="rounded-xl border border-borderDark bg-black/30 p-4">
            <StatusRow label="Network Mode" value="Arc Testnet only" />
            <StatusRow label="Wallet" value={isConnected ? shortenAddress(address) : "Disconnected"} />
            <StatusRow label="Contract Addresses" value={missingContracts.length ? "Configuration required" : "Public deployment configured"} />
            <StatusRow label="OpenAI Runner" value="Server-only API" />
            <StatusRow label="USDC Decimals" value="6" />
          </div>
          {(connectError || switchError) && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-[12px] leading-5 text-danger">{connectError?.message || switchError?.message}</div>}
          {!isConnected && <button className="mt-4 w-full rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-[13px] font-medium text-accent hover:bg-accent/20" onClick={openWalletSelector}>Connect Wallet</button>}
        </Modal>
      )}
    </header>
  );
}
