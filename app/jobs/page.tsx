"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { SetupRequired } from "../../components/layout/SetupRequired";
import { Card } from "../../components/ui/Card";
import { shortenAddress } from "../../lib/design/copy";
import { formatUSDC } from "../../lib/format/usdc";
import { JobStatusBadge } from "../../components/jobs/JobStatusBadge";
import { logger } from "../../lib/logger";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { getBrowserContractAddresses } from "../../lib/contracts/browser-addresses";
import { readJobs } from "../../lib/contracts/browser-read";

export default function JobsDirectory() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const addresses = getBrowserContractAddresses();

  useEffect(() => {
    async function fetchJobs() {
      try {
        if (!publicClient || !addresses) throw new Error("Arc Testnet contracts not configured.");
        setJobs(await readJobs(publicClient, addresses));
      } catch (err) {
        logger.warn("ui.jobs", "fetch:failed", { error: err }, "Jobs registry fetch failed");
        setError(err instanceof Error ? err.message : "Failed to fetch jobs");
      } finally {
        setLoading(false);
      }
    }
    fetchJobs();
  }, [publicClient]);

  useEffect(() => {
    if (!loading && !error && jobs.length === 0) {
      logger.info("ui.jobs", "emptyState", {}, "Jobs registry loaded with no indexed jobs");
    }
  }, [error, jobs.length, loading]);

  if (loading) return <div className="py-20 text-center text-[13px] leading-6 text-slate-500 animate-pulse">Loading jobs...</div>;
  if (error) return <SetupRequired />;

  return (
    <div className="flex flex-col gap-8 animate-fadeInUp">
      <PageHeader
        title="Jobs Registry"
        description="Monitor real AI agent jobs, USDC escrows, and execution states."
        actions={
          <Link href="/jobs/create">
            <Button variant="primary" className="shadow-glow">Create Job</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 stagger-children">
        {jobs.length === 0 ? (
          <Card className="p-16 text-center border-dashed border-borderDark/80 bg-white/[0.01] flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mb-6 border border-borderLight/20 shadow-glow-sm">
              <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-slate-500" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <h3 className="text-white font-heading text-xl mb-3">No active escrows</h3>
            <div className="mb-6 text-[14px] leading-6 text-slate-500 max-w-sm">
              Create a job to securely fund an AI agent via smart contract escrow.
            </div>
            <Link href="/jobs/create">
              <Button variant="secondary" className="shadow-depth-sm">Create First Job</Button>
            </Link>
          </Card>
        ) : (
          jobs.map((job) => (
            <Link href={`/jobs/${job.jobId}`} key={job.jobId} className="block group">
              <Card className="flex flex-col items-center justify-between gap-5 p-6 border-borderDark/80 hover:border-accent/40 bg-[linear-gradient(180deg,rgba(15,23,42,0.5),rgba(8,12,24,0.4))] transition-all duration-300 md:flex-row hover:shadow-[0_8px_30px_rgba(147,197,253,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="flex flex-1 items-center gap-5 w-full">
                  <div className="flex-center h-14 w-14 shrink-0 rounded-xl border border-borderDark/60 bg-black/40 transition-all duration-500 group-hover:border-accent/50 group-hover:bg-accent/5 group-hover:shadow-[inset_0_0_20px_rgba(147,197,253,0.1)]">
                    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-slate-500 transition-colors duration-500 group-hover:text-accent" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-heading text-[18px] font-medium leading-tight tracking-[-0.01em] text-white transition-colors group-hover:text-accent drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">
                        Job #{job.jobId}
                      </h3>
                      <JobStatusBadge statusLabel={job.statusLabel ?? "Unknown"} className="shadow-sm" />
                    </div>
                    <div className="text-[13px] leading-5 text-slate-500 truncate">
                      Client: <span className="mono-value text-slate-300">{shortenAddress(job.client)}</span>
                      {job.agentId && <> <span className="mx-2 text-borderDark">•</span> Agent: <span className="mono-value text-slate-300">#{job.agentId}</span></>}
                    </div>
                  </div>
                </div>

                <div className="flex w-full md:w-auto shrink-0 items-center gap-8 rounded-xl border border-borderDark/40 bg-black/20 px-6 py-4 shadow-depth-inset group-hover:border-borderDark transition-colors">
                  <div className="flex flex-col items-end w-full">
                    <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500 mb-1">Escrow Amount</span>
                    <span className={`mono-value text-[16px] font-medium ${
                      [1, 2, 3, 4].includes(job.status) 
                        ? "text-success drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]" 
                        : "text-slate-300"
                    }`}>
                      {formatUSDC(job.amount, { compact: true })}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
