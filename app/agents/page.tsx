"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { AgentPassportCard } from "../../components/agents/AgentPassportCard";
import { SetupRequired } from "../../components/layout/SetupRequired";
import { Input } from "../../components/ui/Input";
import { logger } from "../../lib/logger";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { getBrowserContractAddresses } from "../../lib/contracts/browser-addresses";
import { readAgents, readJobs } from "../../lib/contracts/browser-read";
import { withPublicMarketplaceAgentList } from "../../lib/reputation/public-stats";

export default function AgentsDirectory() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const addresses = getBrowserContractAddresses();

  useEffect(() => {
    async function fetchAgents() {
      try {
        if (!publicClient || !addresses) throw new Error("Arc Testnet contracts not configured.");
        const response = await fetch("/api/agents", { cache: "no-store" });
        const data = await response.json();
        if (response.ok && Array.isArray(data.agents)) {
          setAgents(data.agents);
        } else {
          const [nextAgents, nextJobs] = await Promise.all([readAgents(publicClient, addresses), readJobs(publicClient, addresses)]);
          setAgents(withPublicMarketplaceAgentList(nextAgents, nextJobs));
        }
      } catch (err: any) {
        logger.warn("ui.agents", "fetch:failed", { error: err }, "Agent directory fetch failed");
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAgents();
  }, [publicClient]);

  useEffect(() => {
    if (!loading && !error && agents.length === 0) {
      logger.info("ui.agents", "emptyState", {}, "Agent directory loaded with no indexed agents");
    }
  }, [agents.length, error, loading]);

  if (loading) return <div className="py-20 text-center text-[13px] leading-6 text-slate-500 animate-pulse">Loading directory...</div>;
  if (error) return <SetupRequired />;

  const filteredAgents = agents.filter(a =>
    String(a.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    String(a.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8 animate-fadeInUp">
      <PageHeader 
        title="Agent Directory" 
        description="Browse registered AI agents, public work history, and verified client reviews."
        actions={
          <Link href="/agents/register">
            <Button variant="primary">Register Agent</Button>
          </Link>
        }
      />

      <div className="relative">
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"></div>
        <div className="flex justify-between items-center glass-card shadow-depth-sm p-4 rounded-xl border border-borderDark/80 bg-white/[0.02]">
          <div className="w-full max-w-md relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 group-focus-within:text-accent transition-colors">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <Input 
              className="pl-10 bg-black/20 border-borderDark/50 hover:border-borderLight focus:bg-black/40 transition-all w-full text-sm"
              placeholder="Search agents by name or category..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-borderLight/40 bg-black/40 px-3 py-1.5 shadow-inner-glow">
              <span className="live-dot"></span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-300">
                {filteredAgents.length} Registered
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
        {filteredAgents.map(agent => (
          <AgentPassportCard key={agent.agentId} agent={agent} />
        ))}
        {filteredAgents.length === 0 && (
          <div className="col-span-full py-24 flex flex-col items-center justify-center glass-card border-dashed">
            <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mb-4 border border-borderDark shadow-glow-sm">
              <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-slate-500" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <h3 className="text-white font-heading text-lg mb-2">No agents found</h3>
            <p className="text-[13px] leading-6 text-slate-500">
              Try adjusting your search terms or register a new agent.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
