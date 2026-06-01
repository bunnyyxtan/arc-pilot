"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { shortenAddress } from "../../lib/design/copy";
import { SetupRequired } from "../../components/layout/SetupRequired";
import { Card } from "../../components/ui/Card";
import { DisputeOutcomeBadge } from "../../components/disputes/DisputeOutcomeBadge";

export default function DisputesDirectory() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/disputes", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to read Arc Testnet disputes.");
        setDisputes(data.disputes ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to read Arc Testnet disputes.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="animate-pulse py-20 text-center text-[13px] leading-6 text-slate-500">Loading Arc Testnet disputes...</div>;
  if (error) return <SetupRequired message={error} />;

  return (
    <div className="flex flex-col gap-10 animate-fadeInUp">
      <div className="relative flex flex-col gap-2 border-b border-borderDark/60 pb-8">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-danger/30 to-transparent"></div>
        <h1 className="lux-heading text-[36px] tracking-[-0.03em] text-white">Dispute Resolution</h1>
        <p className="lux-copy max-w-2xl text-[15px] text-slate-400">Review Arc Testnet arbitration records and submit evidence from an authorized wallet.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 stagger-children">
        {disputes.length === 0 ? (
          <Card className="border-dashed border-borderDark/80 bg-white/[0.01] p-16 text-center">
            <div className="font-heading text-[22px] font-medium text-white">No disputes indexed</div>
            <div className="mt-2 text-[14px] leading-6 text-slate-500">The configured Arc Testnet deployment has no dispute records yet.</div>
          </Card>
        ) : disputes.map((dispute) => (
          <Link href={`/disputes/${dispute.disputeId}`} key={String(dispute.disputeId)} className="block group">
            <Card className="flex flex-col justify-between gap-5 border-borderDark/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.6),rgba(8,12,24,0.5))] p-6 transition-all duration-300 hover:border-danger/40 md:flex-row md:items-center">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-heading text-[20px] font-medium text-white">Dispute #{String(dispute.disputeId)}</h3>
                  <DisputeOutcomeBadge outcome={Number(dispute.outcome)} />
                </div>
                <div className="mono-value mt-2 text-[12px] text-slate-500">Job #{String(dispute.jobId)} / Opened by {shortenAddress(dispute.openedBy)}</div>
              </div>
              <div className="grid gap-2 text-right text-[12px] uppercase tracking-[0.18em]">
                <div className="text-slate-500">{dispute.resolved ? "Resolved onchain" : dispute.manualReviewStatus ? "Under manual review" : "Awaiting resolution"}</div>
                {dispute.manualReviewStatus && <div className="text-warning">Manual appeal {dispute.manualReviewStatus}</div>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
