"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { shortenAddress } from "../../lib/design/copy";
import { formatAgentDisplayId } from "../../lib/design/agent-id";
import { formatUSDC } from "../../lib/format/usdc";
import { logger } from "../../lib/logger";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { getBrowserContractAddresses } from "../../lib/contracts/browser-addresses";
import { readAgents } from "../../lib/contracts/browser-read";

type Agent = {
  agentId: string;
  name: string;
  category: string;
  active: boolean;
  operatingWallet: string;
  reserveWallet: string;
  trustBond: string;
  stats?: {
    lifetimeEarned?: string;
    totalEscrowed?: string;
  };
  treasuryPolicy?: {
    operatingBps: string;
    reserveBps: string;
    bondBps: string;
  };
};

function bpsLabel(value: string | number | bigint | undefined) {
  return `${(Number(value ?? 0) / 100).toFixed(0)}%`;
}

function bpsNumber(value: string | number | bigint | undefined) {
  return Number(value ?? 0) / 100;
}

export default function TreasuryCommandCockpit() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const addresses = getBrowserContractAddresses();

  useEffect(() => {
    async function fetchAgents() {
      try {
        if (!publicClient || !addresses) throw new Error("Arc Testnet contracts not configured.");
        setAgents(await readAgents(publicClient, addresses) as unknown as Agent[]);
      } catch (err) {
        logger.warn("ui.treasury", "fetch:failed", { error: err }, "Treasury overview fetch failed");
        setError(err instanceof Error ? err.message : "Failed to load treasury data");
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
  }, [publicClient]);

  const totals = useMemo(() => {
    return agents.reduce(
      (acc, agent) => ({
        trustBond: acc.trustBond + Number(agent.trustBond ?? 0),
        lifetimeEarned: acc.lifetimeEarned + Number(agent.stats?.lifetimeEarned ?? 0),
        totalEscrowed: acc.totalEscrowed + Number(agent.stats?.totalEscrowed ?? 0)
      }),
      { trustBond: 0, lifetimeEarned: 0, totalEscrowed: 0 }
    );
  }, [agents]);

  // Contract-backed registry snapshots for a compact treasury activity panel.
  const recentEvents = useMemo(() => {
    const evts: any[] = [];
    agents.forEach(a => {
      evts.push({ type: 'Trust Bond Indexed', amount: a.trustBond, status: 'Indexed' });
      if (Number(a.stats?.lifetimeEarned ?? 0) > 0) {
        evts.push({ type: 'Lifetime Earnings Indexed', amount: a.stats?.lifetimeEarned, status: 'Indexed' });
      }
    });
    return evts.slice(0, 5);
  }, [agents]);

  if (loading) {
    return <div className="animate-pulse py-24 text-center text-[13px] leading-6 text-slate-500">Loading Treasury Cockpit...</div>;
  }

  return (
    <div className="flex flex-col h-full gap-6 animate-fadeInUp max-w-full">
      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden rounded-[24px] border border-borderDark/80 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.1),transparent_50%),linear-gradient(180deg,rgba(10,15,29,0.72) 0%,rgba(6,9,20,0.85) 100%)] p-8 shadow-depth-lg backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-px scanline opacity-50"></div>
        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-info/30 bg-info/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-info shadow-[0_0_15px_rgba(59,130,246,0.2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-info shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse"></span>
              Real Treasury State
            </div>
            <h1 className="lux-heading tracking-[-0.03em] text-[36px] sm:text-[44px] drop-shadow-[0_0_12px_rgba(255,255,255,0.1)]">Treasury Command Cockpit</h1>
            <p className="lux-copy mt-4 max-w-2xl text-[15px]">
              Global monitoring for agent operating wallets, reserve vaults, active trust bonds, and algorithmic revenue split policies.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/agents"><Button variant="secondary" className="shadow-depth-sm">View Registry</Button></Link>
              <Link href="/agents/register"><Button variant="primary" className="shadow-glow">Register Agent</Button></Link>
            </div>
          </div>
          
          {/* Treasury Health Module */}
          <div className="lg:w-[320px] rounded-xl border border-borderDark/80 bg-black/40 p-5 shadow-depth-inset shrink-0">
            <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-4 flex items-center justify-between">
              Treasury Health <span className="live-dot scale-75"></span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-slate-400">Reserve Coverage</span>
                <span className="mono-value text-[13px] text-success drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">Indexed</span>
              </div>
              <div className="h-px bg-white/[0.04]"></div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-slate-400">Settlement Drift</span>
                <span className="mono-value text-[13px] text-white">N/A</span>
              </div>
              <div className="h-px bg-white/[0.04]"></div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-slate-400">Bond Utilization</span>
                <span className="mono-value text-[13px] text-info">N/A</span>
              </div>
              <div className="h-px bg-white/[0.04]"></div>
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-slate-400">Agent Treasuries</span>
                <span className="mono-value text-[13px] text-white">{agents.length}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <Card className="border-warning/30 bg-warning/10 p-4 text-[13px] leading-6 text-warning">
          {error}. Confirm the Arc Testnet deployment addresses and RPC availability.
        </Card>
      )}

      {/* 2. 4-CARD GRID */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 stagger-children">
        <Card className="p-6 relative overflow-hidden group shadow-depth-md bg-[radial-gradient(ellipse_at_top_right,rgba(15,23,42,0.4),rgba(6,9,20,0.6))]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.02] blur-[30px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-white/[0.04] transition-all"></div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Indexed Agents</div>
          <div className="font-heading text-[32px] font-[520] text-white tracking-[-0.02em]">{agents.length}</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full w-full bg-white/[0.2] rounded-full"></div></div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Active</span>
          </div>
        </Card>
        
        <Card className="p-6 relative overflow-hidden group shadow-depth-md bg-[radial-gradient(ellipse_at_top_right,rgba(15,23,42,0.4),rgba(6,9,20,0.6))]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-info/10 blur-[30px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-info/20 transition-all"></div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Trust Bonds</div>
          <div className="font-heading text-[32px] font-[520] text-white tracking-[-0.02em]">{formatUSDC(totals.trustBond, { compact: true })}</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full w-[80%] bg-info rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div></div>
            <span className="text-[10px] text-info uppercase tracking-widest">Locked</span>
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden group shadow-depth-md bg-[radial-gradient(ellipse_at_top_right,rgba(15,23,42,0.4),rgba(6,9,20,0.6))]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 blur-[30px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-success/20 transition-all"></div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Lifetime Earned</div>
          <div className="font-heading text-[32px] font-[520] text-white tracking-[-0.02em]">{formatUSDC(totals.lifetimeEarned, { compact: true })}</div>
          <div className="mt-3 flex items-center gap-2">
             <div className="h-1 flex-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full w-[100%] bg-success rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div></div>
             <span className="text-[10px] text-success uppercase tracking-widest">Indexed</span>
          </div>
        </Card>

        <Card className="p-6 relative overflow-hidden group shadow-depth-md bg-[radial-gradient(ellipse_at_top_right,rgba(15,23,42,0.4),rgba(6,9,20,0.6))]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 blur-[30px] rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-accent/20 transition-all"></div>
          <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">Treasury Coverage</div>
          <div className="font-heading text-[32px] font-[520] text-white tracking-[-0.02em]">{formatUSDC(totals.lifetimeEarned + totals.trustBond, { compact: true })}</div>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 bg-white/[0.04] rounded-full overflow-hidden"><div className="h-full w-[95%] bg-accent rounded-full shadow-[0_0_8px_rgba(147,197,253,0.6)]"></div></div>
            <span className="text-[10px] text-accent uppercase tracking-widest">Indexed</span>
          </div>
        </Card>
      </section>

      {/* 3. MAIN 12-COL CONTENT */}
      {agents.length === 0 ? (
         <Card className="flex flex-col items-center justify-center border-dashed border-borderDark/80 bg-white/[0.015] px-6 py-20 text-center shadow-depth-md mt-4">
           <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-borderLight/30 bg-white/[0.025] shadow-glow-sm">
             <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-slate-500" stroke="currentColor" strokeWidth="1.5"><path d="M3 21h18" /><path d="M3 7v10" /><path d="M21 7v10" /><path d="M7 21v-4" /><path d="M17 21v-4" /><path d="M12 21v-4" /><path d="M12 3l9 4H3l9-4z" /></svg>
           </div>
           <h2 className="font-heading text-[20px] font-medium tracking-[-0.01em] text-white">No Agent Treasury Selected</h2>
           <p className="mt-3 max-w-md text-[14px] leading-relaxed text-slate-500">
             Register an Arc Testnet agent to populate real treasury data, then inspect its wallets and split policy here.
           </p>
         </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-2">
          
          {/* LEFT SIDE: 8 Cols */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* A. Agent Treasury Ledger */}
            <div>
              <div className="text-[12px] uppercase tracking-[0.18em] text-slate-500 mb-4 px-1">Agent Treasury Ledger</div>
              <div className="flex flex-col gap-4">
                {agents.map((agent) => {
                  const opBps = bpsNumber(agent.treasuryPolicy?.operatingBps);
                  const resBps = bpsNumber(agent.treasuryPolicy?.reserveBps);
                  
                  return (
                    <Card key={agent.agentId} className="p-6 relative overflow-hidden group shadow-depth-md border-borderDark/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.4),rgba(8,12,24,0.3))] hover:border-accent/30 transition-all duration-300">
                       <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-white/[0.05] to-transparent group-hover:via-accent/40 transition-colors"></div>
                       
                       <div className="flex flex-col gap-6">
                         {/* Header */}
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex-center shadow-glow-sm">
                                <span className="text-[11px] text-accent font-heading font-medium">{formatAgentDisplayId(agent.name, agent.agentId).slice(4, 7)}</span>
                              </div>
                              <div>
                                <h3 className="font-heading text-[18px] text-white tracking-[-0.01em]">{agent.name || `Agent ${agent.agentId}`}</h3>
                                <div className="mono-value text-[11px] text-slate-600">{formatAgentDisplayId(agent.name, agent.agentId)} / Onchain ID: {agent.agentId}</div>
                                <div className="text-[12px] text-slate-500 mt-0.5">{agent.category || "General AI"}</div>
                              </div>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${agent.active ? "border-success/30 bg-success/10 text-success shadow-glow-success" : "border-borderLight bg-white/[0.03] text-slate-400"}`}>
                              {agent.active ? "Active" : "Inactive"}
                            </span>
                         </div>

                         {/* Details Grid */}
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           <div className="bg-black/40 border border-borderDark rounded-xl p-3 shadow-depth-inset">
                             <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Operating Wallet</div>
                             <div className="mono-value text-[13px] text-slate-300">{shortenAddress(agent.operatingWallet)}</div>
                           </div>
                           <div className="bg-black/40 border border-borderDark rounded-xl p-3 shadow-depth-inset">
                             <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Reserve Wallet</div>
                             <div className="mono-value text-[13px] text-slate-300">{shortenAddress(agent.reserveWallet)}</div>
                           </div>
                           <div className="bg-black/40 border border-borderDark rounded-xl p-3 shadow-depth-inset">
                             <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Trust Bond</div>
                             <div className="font-heading text-[16px] text-info drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">{formatUSDC(agent.trustBond, { compact: true })}</div>
                           </div>
                           <div className="bg-black/40 border border-borderDark rounded-xl p-3 shadow-depth-inset">
                             <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Lifetime Earned</div>
                             <div className="font-heading text-[16px] text-success drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">{formatUSDC(agent.stats?.lifetimeEarned, { compact: true })}</div>
                           </div>
                         </div>

                         {/* Allocation Bar & Actions */}
                         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-t border-white/[0.04]">
                           <div className="flex-1 max-w-sm">
                             <div className="flex justify-between text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                               <span>Operating ({opBps}%)</span>
                               <span>Reserve ({resBps}%)</span>
                             </div>
                             <div className="h-1.5 flex rounded-full overflow-hidden bg-white/[0.04]">
                               <div className="h-full bg-accent" style={{ width: `${opBps}%` }}></div>
                               <div className="h-full bg-info" style={{ width: `${resBps}%` }}></div>
                             </div>
                           </div>
                           <div className="flex gap-2 shrink-0">
                             <Link href={`/treasury/${agent.agentId}`}>
                               <Button variant="ghost" className="text-[12px] h-8 px-4 border border-borderDark bg-white/[0.02] hover:bg-white/[0.05]">Policy</Button>
                             </Link>
                             <Link href={`/agents/${agent.agentId}`}>
                               <Button variant="secondary" className="text-[12px] h-8 px-4">View Agent</Button>
                             </Link>
                           </div>
                         </div>
                       </div>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* B. Settlement Activity Stream */}
            <div className="mt-4">
               <div className="text-[12px] uppercase tracking-[0.18em] text-slate-500 mb-4 px-1">Settlement Activity Stream</div>
               <Card className="p-0 shadow-depth-lg border-borderDark/80 bg-[linear-gradient(180deg,rgba(10,15,30,0.7),rgba(6,10,20,0.85))] overflow-hidden">
                 <div className="flex-1 overflow-y-auto flex flex-col p-4 custom-scrollbar max-h-[300px]">
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

          </div>

          {/* RIGHT SIDE: 4 Cols */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* A. Reserve Stack Panel */}
            <Card className="p-6 shadow-depth-lg border-borderDark/80 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.05),transparent_70%)] relative">
               <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-6 flex items-center justify-between">
                 Reserve Stack
                 <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-slate-500" stroke="currentColor" strokeWidth="2"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
               </div>
               
               <div className="flex flex-col gap-5">
                 <div>
                   <div className="flex justify-between text-[13px] mb-2"><span className="text-slate-400">Operating Wallets</span><span className="mono-value text-white">Policy dependent</span></div>
                 </div>
                 <div>
                   <div className="flex justify-between text-[13px] mb-2"><span className="text-slate-400">Reserve Wallets</span><span className="mono-value text-white">Policy dependent</span></div>
                 </div>
                 <div>
                   <div className="flex justify-between text-[13px] mb-2"><span className="text-slate-400">Trust Bonds</span><span className="mono-value text-white">{formatUSDC(totals.trustBond, { compact: true })}</span></div>
                 </div>
                 <div>
                   <div className="flex justify-between text-[13px] mb-2"><span className="text-slate-400">Earned Fees</span><span className="mono-value text-white">{formatUSDC(totals.lifetimeEarned, { compact: true })}</span></div>
                 </div>
               </div>
            </Card>

            {/* B. Split Policy Matrix */}
            <Card className="p-6 shadow-depth-lg border-borderDark/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.4),rgba(8,12,24,0.3))] relative overflow-hidden">
               <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"></div>
               <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-6 flex items-center justify-between">
                 Policy Inspection
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                 <div className="bg-black/40 border border-borderDark rounded-xl p-4 shadow-depth-inset text-center">
                   <div className="font-heading text-[24px] text-white">{agents.length}</div>
                   <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">Agent Policies</div>
                 </div>
                 <div className="bg-black/40 border border-borderDark rounded-xl p-4 shadow-depth-inset text-center">
                   <div className="font-heading text-[24px] text-white">Onchain</div>
                   <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">Policy Source</div>
                 </div>
                 <div className="bg-black/40 border border-borderDark rounded-xl p-4 shadow-depth-inset text-center">
                   <div className="font-heading text-[24px] text-white">Per Agent</div>
                   <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">Split Scope</div>
                 </div>
                 <div className="bg-black/40 border border-borderDark rounded-xl p-4 shadow-depth-inset text-center flex flex-col justify-center items-center">
                   <div className="w-6 h-6 rounded-full bg-success/20 border border-success/40 flex-center mb-1"><svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 text-success" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></div>
                   <div className="text-[10px] uppercase tracking-widest text-success">Inspectable</div>
                 </div>
               </div>
            </Card>

            {/* C. Risk Monitor */}
            <Card className="p-6 shadow-depth-lg border-borderDark/80 bg-[radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.05),transparent_70%)] relative">
               <div className="text-[11px] uppercase tracking-widest text-slate-500 mb-5">Risk Monitor</div>
               
               <div className="flex flex-col gap-4">
                 <div className="flex items-start gap-3">
                   <div className="mt-0.5 w-4 h-4 rounded-full bg-success/10 border border-success/30 flex-center shrink-0">
                     <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                   </div>
                   <div>
                     <div className="text-[13px] text-white font-medium">Contract Reads Active</div>
                     <div className="text-[12px] text-slate-500">Treasury values come from Arc Testnet</div>
                   </div>
                 </div>
                 <div className="flex items-start gap-3">
                   <div className="mt-0.5 w-4 h-4 rounded-full bg-success/10 border border-success/30 flex-center shrink-0">
                     <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                   </div>
                   <div>
                     <div className="text-[13px] text-white font-medium">{agents.length} Agent Treasuries</div>
                     <div className="text-[12px] text-slate-500">Registry identities currently indexed</div>
                   </div>
                 </div>
                 <div className="flex items-start gap-3">
                   <div className="mt-0.5 w-4 h-4 rounded-full bg-success/10 border border-success/30 flex-center shrink-0">
                     <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                   </div>
                   <div>
                     <div className="text-[13px] text-white font-medium">Trust Bonds Indexed</div>
                     <div className="text-[12px] text-slate-500">{formatUSDC(totals.trustBond, { compact: true })} recorded onchain</div>
                   </div>
                 </div>
                 <div className="flex items-start gap-3">
                   <div className="mt-0.5 w-4 h-4 rounded-full bg-success/10 border border-success/30 flex-center shrink-0">
                     <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
                   </div>
                   <div>
                     <div className="text-[13px] text-white font-medium">Public Deployment Configured</div>
                     <div className="text-[12px] text-slate-500">Read from the configured Arc Testnet deployment</div>
                   </div>
                 </div>
               </div>
            </Card>

          </div>
        </div>
      )}
    </div>
  );
}
