"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "../../../lib/chains/arc-testnet";
import { agentJobEscrowAbi } from "../../../lib/contracts/browser-abis";
import { getBrowserContractAddresses } from "../../../lib/contracts/browser-addresses";
import { readAgentView } from "../../../lib/contracts/browser-read";
import { useArcTransaction } from "../../../lib/contracts/hooks";
import { SetupRequired } from "../../../components/layout/SetupRequired";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { CopyButton } from "../../../components/ui/CopyButton";
import { shortenAddress } from "../../../lib/design/copy";
import { formatAgentDisplayId } from "../../../lib/design/agent-id";
import { formatUSDC } from "../../../lib/format/usdc";
import { TreasurySplitVisual } from "../../../components/treasury/TreasurySplitVisual";
import { SpendingPolicyVisual } from "../../../components/policies/SpendingPolicyVisual";
import { Input } from "../../../components/ui/Input";
import { TxStatus } from "../../../components/shared/TxStatus";
import Link from "next/link";
import { toBigIntSafe } from "../../../lib/format/ids";
import { logger } from "../../../lib/logger";

export default function AgentTreasury() {
  const params = useParams();
  const agentId = params?.agentId as string;
  const safeAgentId = toBigIntSafe(agentId);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [operatingBps, setOperatingBps] = useState("8000");
  const [reserveBps, setReserveBps] = useState("1000");
  const [bondBps, setBondBps] = useState("1000");
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const addresses = getBrowserContractAddresses();
  const { tx, run, wallet } = useArcTransaction();

  const fetchTreasury = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        if (!safeAgentId) throw new Error("Invalid agent ID.");
        let indexedAgent: any = null;
        try {
          const response = await fetch(`/api/agents/${agentId}`, { cache: "no-store" });
          const body = await response.json();
          if (response.ok && body?.agent) indexedAgent = body.agent;
        } catch (apiError) {
          logger.warn("ui.treasury.detail", "indexedRead:failed", { agentId, apiError }, "Indexed treasury fallback is unavailable");
        }
        if (!publicClient || !addresses) {
          if (indexedAgent) {
            setData(indexedAgent);
            return;
          }
          throw new Error("Arc Testnet contracts not configured.");
        }
        let payload;
        try {
          payload = await readAgentView(publicClient, addresses, safeAgentId);
        } catch (onchainError) {
          if (!indexedAgent) throw onchainError;
          logger.warn("ui.treasury.detail", "onchainRead:fallback", { agentId, onchainError }, "Using indexed treasury after Arc Testnet read failed");
          payload = indexedAgent;
        }
        setData(payload);
        if (payload.treasuryPolicy) {
          setOperatingBps(String(payload.treasuryPolicy.operatingBps));
          setReserveBps(String(payload.treasuryPolicy.reserveBps));
          setBondBps(String(payload.treasuryPolicy.bondBps));
        }
      } catch (err: any) {
        logger.warn("ui.treasury.detail", "load:failed", { agentId, contractsConfigured: Boolean(addresses), err }, "Treasury detail failed to load");
        setError(err instanceof Error ? err.message : "Failed to load agent treasury.");
      } finally {
        setLoading(false);
      }
  }, [addresses, agentId, publicClient, safeAgentId]);

  useEffect(() => {
    if (agentId) fetchTreasury();
  }, [agentId, fetchTreasury]);

  // Contract-backed registry snapshots for a compact activity panel.
  const recentEvents = useMemo(() => {
    if (!data) return [];
    const evts: any[] = [];
    evts.push({ type: 'Trust Bond Indexed', amount: data.trustBond, status: 'Indexed' });
    if (Number(data.stats?.lifetimeEarned ?? 0) > 0) {
      evts.push({ type: 'Lifetime Earnings Indexed', amount: data.stats?.lifetimeEarned, status: 'Indexed' });
    }
    return evts.slice(0, 5);
  }, [data]);

  if (loading) return <div className="py-24 text-center text-[13px] leading-6 text-slate-500 animate-pulse">Loading Agent Treasury...</div>;
  if (error || !data) return <SetupRequired message={error || "Agent not found or indexer is unavailable."} />;
  const displayId = formatAgentDisplayId(data.name, data.agentId);
  const isOwner = wallet.address?.toLowerCase() === String(data.owner).toLowerCase();
  const pending = tx.phase === "pending" || tx.phase === "confirming";

  const treasuryPolicy = data.treasuryPolicy ?? { operatingBps: 8000, reserveBps: 1000, bondBps: 1000 };
  const spendingPolicy = data.spendingPolicy ?? {
    maxSpendPerJob: 0,
    dailySpendLimit: 0,
    allowData: false,
    allowApi: false,
    allowCompute: false,
    allowOtherAgents: false,
    active: false
  };

  return (
    <div className="flex flex-col h-full gap-6 animate-fadeInUp max-w-full">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden rounded-[24px] border border-borderDark/80 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.08),transparent_50%),linear-gradient(180deg,rgba(10,15,29,0.72) 0%,rgba(6,9,20,0.85) 100%)] p-8 shadow-depth-lg backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-px scanline opacity-50"></div>
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-success shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse"></span>
              {data.active ? "Active Agent" : "Inactive Agent"}
            </div>
            <h1 className="lux-heading tracking-[-0.03em] text-[36px] sm:text-[44px] drop-shadow-[0_0_12px_rgba(255,255,255,0.1)] mb-2">Agent Treasury</h1>
            <p className="lux-copy max-w-2xl text-[15px] mb-6">
              Individual cockpit for {data.name || `Agent ${data.agentId}`} ({data.category || "General AI"}). Manage active balances, split policies, and autonomous spending limits.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-borderDark/50 shadow-depth-inset shrink-0">
                <span className="text-[11px] uppercase tracking-widest text-slate-500">Agent ID</span>
                <span className="mono-value text-[13px] text-white ml-1">{displayId}</span>
                <span className="mono-value text-[11px] text-slate-600">Onchain ID: {data.agentId?.toString?.() ?? data.agentId}</span>
                <CopyButton text={String(data.agentId)} label="" />
              </div>
              <Button variant="secondary" className="shadow-depth-sm" onClick={() => setPolicyModalOpen(true)}>Policy</Button>
              <Link href={`/agents/${agentId}`}><Button variant="primary" className="shadow-glow bg-info hover:bg-info/90 text-white border-transparent">Manage Withdrawals</Button></Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 4-CARD GRID */}
      <TxStatus tx={tx} />
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 stagger-children">
        <Card className="p-6 relative overflow-hidden group shadow-depth-md bg-[radial-gradient(ellipse_at_top_right,rgba(15,23,42,0.4),rgba(6,9,20,0.6))]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-info/10 blur-[30px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-info/20 transition-all"></div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Trust Bond</div>
          <div className="font-heading text-[32px] font-[520] text-white tracking-[-0.02em] leading-none mb-1">{formatUSDC(data.trustBond, { compact: true })}</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full w-[100%] bg-info rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div></div>
            <span className="text-[10px] text-info uppercase tracking-widest">Locked</span>
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden group shadow-depth-md bg-[radial-gradient(ellipse_at_top_right,rgba(15,23,42,0.4),rgba(6,9,20,0.6))]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 blur-[30px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-success/20 transition-all"></div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Lifetime Earned</div>
          <div className="font-heading text-[32px] font-[520] text-white tracking-[-0.02em] leading-none mb-1">{formatUSDC(data.stats?.lifetimeEarned, { compact: true })}</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full w-[100%] bg-success rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div></div>
            <span className="text-[10px] text-success uppercase tracking-widest">Cleared</span>
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden group shadow-depth-md bg-[radial-gradient(ellipse_at_top_right,rgba(15,23,42,0.4),rgba(6,9,20,0.6))]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] blur-[30px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-white/[0.05] transition-all"></div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Operating Wallet</div>
          <div className="font-heading text-[24px] font-[520] text-white tracking-[-0.02em] leading-none mb-1 truncate">{shortenAddress(data.operatingWallet)}</div>
          <div className="mt-3 text-[10px] text-slate-400 uppercase tracking-widest">Payout Destination</div>
        </Card>

        <Card className="p-6 relative overflow-hidden group shadow-depth-md bg-[radial-gradient(ellipse_at_top_right,rgba(15,23,42,0.4),rgba(6,9,20,0.6))]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] blur-[30px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-white/[0.05] transition-all"></div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Reserve Wallet</div>
          <div className="font-heading text-[24px] font-[520] text-white tracking-[-0.02em] leading-none mb-1 truncate">{shortenAddress(data.reserveWallet)}</div>
          <div className="mt-3 text-[10px] text-slate-400 uppercase tracking-widest">Reserve Destination</div>
        </Card>
      </section>

      {/* 3. MIDDLE SECTION: Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children">
        <Card className="p-6 shadow-depth-lg border-borderDark/60 bg-[linear-gradient(180deg,rgba(15,23,42,0.4),rgba(8,12,24,0.3))] relative overflow-hidden flex flex-col">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-info/30 to-transparent"></div>
          <div className="text-[12px] uppercase tracking-[0.18em] text-slate-500 mb-6 px-1">Revenue Split Policy</div>
          
          <div className="flex-1 flex flex-col justify-center">
            <div className="mb-8 relative overflow-hidden rounded-full bg-black/40 border border-borderDark/50 h-3 flex shadow-depth-inset">
              <div className="h-full bg-info progress-shimmer relative" style={{ width: `${Number(treasuryPolicy.operatingBps) / 100}%` }} title="Operating"></div>
              <div className="h-full bg-accent progress-shimmer relative" style={{ width: `${Number(treasuryPolicy.reserveBps) / 100}%` }} title="Reserve"></div>
              <div className="h-full bg-success progress-shimmer relative" style={{ width: `${Number(treasuryPolicy.bondBps) / 100}%` }} title="Bond"></div>
            </div>
            <TreasurySplitVisual policy={treasuryPolicy} />
          </div>
        </Card>

        <Card className="p-6 shadow-depth-lg border-borderDark/60 bg-[linear-gradient(180deg,rgba(15,23,42,0.4),rgba(8,12,24,0.3))] relative overflow-hidden flex flex-col">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-accent/30 to-transparent"></div>
          <div className="text-[12px] uppercase tracking-[0.18em] text-slate-500 mb-6 px-1">Autonomous Spending Limits</div>
          
          <div className="flex-1 flex flex-col justify-center">
            <SpendingPolicyVisual policy={spendingPolicy} />
          </div>
        </Card>
      </div>

      {/* 4. BOTTOM SECTION: Stream & Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 stagger-children">
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="text-[12px] uppercase tracking-[0.18em] text-slate-500 px-1">Settlement Activity Stream</div>
          <Card className="p-0 shadow-depth-lg border-borderDark/80 bg-[linear-gradient(180deg,rgba(10,15,30,0.7),rgba(6,10,20,0.85))] overflow-hidden flex-1">
            <div className="flex-1 overflow-y-auto flex flex-col p-4 custom-scrollbar">
              {recentEvents.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-slate-500">No recent settlement activity.</div>
              ) : (
                recentEvents.map((evt, idx) => (
                  <div key={idx} className="group flex flex-wrap md:flex-nowrap items-center gap-4 p-3 rounded-lg hover:bg-white/[0.02] transition-colors border border-transparent hover:border-white/[0.05] relative animate-fadeInUp" style={{ animationDelay: `${idx * 50}ms` }}>
                    <span className="mono-value text-[13px] text-slate-600 min-w-[100px] whitespace-nowrap">[real]</span>
                    <span className="text-[13px] text-slate-300 font-medium flex-1">{evt.type}</span>
                    <span className="mono-value text-[13px] text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] min-w-[100px] text-right whitespace-nowrap">{formatUSDC(evt.amount, { compact: true })}</span>
                    <div className="min-w-[100px] text-right">
                      <span className="text-[10px] text-success uppercase tracking-widest bg-success/10 border border-success/20 px-2 py-0.5 rounded-full whitespace-nowrap">{evt.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="text-[12px] uppercase tracking-[0.18em] text-slate-500 px-1">Treasury Health</div>
          <Card className="p-6 shadow-depth-lg border-borderDark/80 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.05),transparent_70%)] relative flex-1 flex flex-col justify-center">
            <div className="flex flex-col gap-6">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-success/10 border border-success/30 flex-center shrink-0 shadow-glow-success">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                </div>
                <div>
                  <div className="text-[14px] text-white font-[520] tracking-[-0.01em]">Trust Bond Indexed</div>
                  <div className="text-[13px] text-slate-500 mt-0.5">{formatUSDC(data.trustBond, { compact: true })} read from the Arc Testnet vault</div>
                </div>
              </div>
              <div className="h-px bg-white/[0.04]"></div>
              <div className="flex items-start gap-4">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-success/10 border border-success/30 flex-center shrink-0 shadow-glow-success">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                </div>
                <div>
                  <div className="text-[14px] text-white font-[520] tracking-[-0.01em]">Treasury Policy Read</div>
                  <div className="text-[13px] text-slate-500 mt-0.5">Split values loaded from the escrow contract</div>
                </div>
              </div>
              <div className="h-px bg-white/[0.04]"></div>
              <div className="flex items-start gap-4">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-success/10 border border-success/30 flex-center shrink-0 shadow-glow-success">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                </div>
                <div>
                  <div className="text-[14px] text-white font-[520] tracking-[-0.01em]">Spending Policy Read</div>
                  <div className="text-[13px] text-slate-500 mt-0.5">{spendingPolicy.active ? "Active policy loaded from Arc Testnet" : "No active policy configured"}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
      {policyModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/55 px-4 pt-24 backdrop-blur-sm" onClick={() => setPolicyModalOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-borderLight/30 bg-[#080d19]/95 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.55)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between border-b border-borderDark pb-4">
              <div>
                <h2 className="font-heading text-xl font-medium text-white">Treasury Split Policy</h2>
                <p className="mt-1 text-[13px] text-slate-500">{displayId}</p>
              </div>
              <button className="glass-button h-8 w-8 rounded-full text-slate-400 hover:text-white" onClick={() => setPolicyModalOpen(false)}>x</button>
            </div>
            <TreasurySplitVisual policy={treasuryPolicy} />
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Input label="Operating BPS" type="number" value={operatingBps} onChange={(event) => setOperatingBps(event.target.value)} />
              <Input label="Reserve BPS" type="number" value={reserveBps} onChange={(event) => setReserveBps(event.target.value)} />
              <Input label="Bond BPS" type="number" value={bondBps} onChange={(event) => setBondBps(event.target.value)} />
            </div>
            <div className="mt-4 rounded-xl border border-borderDark bg-black/30 p-4 text-[13px] leading-6 text-slate-500">
              Split values must total 10,000 BPS. Only the agent owner can update this Arc Testnet policy.
            </div>
            <Button className="mt-4 w-full" variant="secondary" disabled={!wallet.isConnected || !wallet.correctNetwork || !isOwner || pending || Number(operatingBps) + Number(reserveBps) + Number(bondBps) !== 10000} onClick={async () => {
              if (!addresses) return;
              const hash = await run("Update treasury policy", { address: addresses.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "setTreasuryPolicy", args: [safeAgentId!, BigInt(operatingBps), BigInt(reserveBps), BigInt(bondBps)] });
              if (hash) await fetchTreasury();
            }}>Update Policy</Button>
          </div>
        </div>
      )}
    </div>
  );
}
