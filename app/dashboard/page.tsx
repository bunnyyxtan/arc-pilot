"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { getBrowserContractAddresses } from "../../lib/contracts/browser-addresses";
import { readAgents, readJobs } from "../../lib/contracts/browser-read";
import { formatUSDC } from "../../lib/format/usdc";
import { shortenAddress } from "../../lib/design/copy";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { JobStatusBadge } from "../../components/jobs/JobStatusBadge";
import { SetupRequired } from "../../components/layout/SetupRequired";
import { withPublicMarketplaceAgentList } from "../../lib/reputation/public-stats";

export default function DashboardPage() {
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const addresses = getBrowserContractAddresses();
  const [agents, setAgents] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!publicClient || !addresses) throw new Error("Arc Testnet contracts not configured.");
        const [agentsResponse, nextJobs] = await Promise.all([fetch("/api/agents", { cache: "no-store" }), readJobs(publicClient, addresses)]);
        const agentsData = await agentsResponse.json();
        const nextAgents = agentsResponse.ok && Array.isArray(agentsData.agents)
          ? agentsData.agents
          : withPublicMarketplaceAgentList(await readAgents(publicClient, addresses), nextJobs);
        setAgents(nextAgents);
        setJobs(nextJobs);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to read Arc Testnet state.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [publicClient]);

  const metrics = useMemo(() => ({
    trustBond: agents.reduce((sum, agent) => sum + BigInt(agent.trustBond ?? 0), 0n),
    lifetimeEarned: agents.reduce((sum, agent) => sum + BigInt(agent.stats?.lifetimeEarned ?? 0), 0n),
    activeJobs: jobs.filter((job) => [1, 2, 3].includes(Number(job.status))).length,
    disputedJobs: jobs.filter((job) => Number(job.status) === 6).length,
    reviewCount: agents.reduce((sum, agent) => sum + Number(agent.reviewSummary?.reviewCount ?? 0), 0),
    reviewedAgents: agents.filter((agent) => Number(agent.reviewSummary?.reviewCount ?? 0) > 0).length
  }), [agents, jobs]);

  if (loading) return <div className="animate-pulse py-24 text-center text-[13px] text-slate-500">Reading Arc Testnet contracts...</div>;
  if (error) return <SetupRequired message={error} />;
  const recentJobs = [...jobs].reverse().slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-lg lg:col-span-3">
          <div className="text-label">Agent Registry</div>
          <div className="mt-3 font-heading text-[48px] text-white">{agents.length}</div>
          <div className="mt-1 text-[13px] text-slate-500">Registered Arc Testnet identities</div>
          <div className="mt-8 border-t border-borderDark pt-4"><div className="text-label">Verified Reviews</div><div className="mono-value mt-2 text-[15px] text-success">{metrics.reviewCount}</div><div className="mt-1 text-[12px] text-slate-500">{metrics.reviewedAgents} reviewed agents</div></div>
          <Link href="/agents"><Button className="mt-6 w-full" variant="secondary">View Agents</Button></Link>
        </Card>
        <Card className="border-borderDark/80 bg-black/20 p-7 shadow-depth-lg lg:col-span-6">
          <div className="flex items-start justify-between gap-4 border-b border-borderDark pb-5"><div><div className="text-label">Escrow Desk</div><h2 className="lux-heading mt-2 text-[28px]">Arc Testnet Jobs</h2></div><Link href="/jobs/create"><Button>Create Job</Button></Link></div>
          <div className="mt-5 space-y-3">
            {recentJobs.length === 0 ? <div className="py-12 text-center text-[13px] text-slate-500">No Arc Testnet jobs indexed yet.</div> : recentJobs.map((job) => (
              <Link href={`/jobs/${job.jobId}`} key={String(job.jobId)} className="flex items-center justify-between gap-4 rounded-xl border border-borderDark bg-white/[0.02] p-4 transition-colors hover:border-accent/30">
                <div><div className="font-heading text-[16px] text-white">Job #{String(job.jobId)}</div><div className="mono-value mt-1 text-[11px] text-slate-500">Client {shortenAddress(job.client)}</div></div>
                <div className="text-right"><JobStatusBadge statusLabel={job.statusLabel} /><div className="mono-value mt-2 text-[12px] text-success">{formatUSDC(job.amount, { compact: true })}</div></div>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-lg lg:col-span-3">
          <div className="text-label">Treasury Snapshot</div>
          <div className="mt-5"><div className="text-[11px] uppercase tracking-widest text-slate-500">Trust Bonds</div><div className="mt-1 font-heading text-[28px] text-white">{formatUSDC(metrics.trustBond, { compact: true })}</div></div>
          <div className="mt-5"><div className="text-[11px] uppercase tracking-widest text-slate-500">Lifetime Earned</div><div className="mt-1 font-heading text-[28px] text-success">{formatUSDC(metrics.lifetimeEarned, { compact: true })}</div></div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-borderDark pt-4"><div><div className="text-label">Active Jobs</div><div className="mono-value mt-1 text-white">{metrics.activeJobs}</div></div><div><div className="text-label">Disputed</div><div className="mono-value mt-1 text-white">{metrics.disputedJobs}</div></div></div>
          <Link href="/treasury"><Button className="mt-6 w-full" variant="secondary">Open Treasury</Button></Link>
        </Card>
      </div>
      <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-lg">
        <div className="text-label">Source Of Truth</div>
        <div className="mt-3 text-[13px] leading-6 text-slate-500">Dashboard values are read directly from the configured Arc Testnet contracts. No static dashboard dataset is used.</div>
      </Card>
    </div>
  );
}
