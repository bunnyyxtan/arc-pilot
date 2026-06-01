"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { parseUnits } from "viem";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "../../../lib/chains/arc-testnet";
import { spendingPolicyManagerAbi, trustBondVaultAbi, erc20Abi } from "../../../lib/contracts/browser-abis";
import { getBrowserContractAddresses } from "../../../lib/contracts/browser-addresses";
import { readAgentView, readJobs } from "../../../lib/contracts/browser-read";
import { useArcTransaction } from "../../../lib/contracts/hooks";
import { formatAgentDisplayId } from "../../../lib/design/agent-id";
import { shortenAddress } from "../../../lib/design/copy";
import { formatUSDC } from "../../../lib/format/usdc";
import { AgentRatingSummary } from "../../../components/agents/AgentRatingSummary";
import { AgentStatsGrid } from "../../../components/agents/AgentStatsGrid";
import { SetupRequired } from "../../../components/layout/SetupRequired";
import { TxStatus } from "../../../components/shared/TxStatus";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Section } from "../../../components/ui/Section";
import { WalletFundsNotice } from "../../../components/wallet/WalletFundsNotice";
import { withPublicMarketplaceStats } from "../../../lib/reputation/public-stats";
import { toBigIntSafe } from "../../../lib/format/ids";
import { logger } from "../../../lib/logger";
import type { AgentReviewRow } from "../../../lib/supabase/types";

export default function AgentDetails() {
  const params = useParams();
  const agentId = params?.agentId as string;
  const safeAgentId = toBigIntSafe(agentId);
  const addresses = getBrowserContractAddresses();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { tx, run, wallet } = useArcTransaction();
  const [agent, setAgent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bondModalOpen, setBondModalOpen] = useState(false);
  const [bondAmount, setBondAmount] = useState("");
  const [maxSpend, setMaxSpend] = useState("");
  const [dailySpend, setDailySpend] = useState("");
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataRecord, setMetadataRecord] = useState<unknown>(null);
  const [metadataCopied, setMetadataCopied] = useState(false);
  const [reviews, setReviews] = useState<AgentReviewRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!safeAgentId) throw new Error("Invalid agent ID.");
      let indexedAgent: any = null;
      try {
        const response = await fetch(`/api/agents/${agentId}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.agent) indexedAgent = data.agent;
      } catch (apiError) {
        logger.warn("ui.agents.detail", "indexedRead:failed", { agentId, apiError }, "Indexed agent fallback is unavailable");
      }
      if (!addresses || !publicClient) {
        if (indexedAgent) {
          setAgent(indexedAgent);
          return;
        }
        throw new Error("Arc Testnet contracts not configured.");
      }
      try {
        const [nextAgent, jobs] = await Promise.all([
          readAgentView(publicClient, addresses, safeAgentId),
          readJobs(publicClient, addresses)
        ]);
        setAgent({ ...withPublicMarketplaceStats(nextAgent, jobs), reviewSummary: indexedAgent?.reviewSummary });
      } catch (onchainError) {
        if (!indexedAgent) throw onchainError;
        logger.warn("ui.agents.detail", "onchainRead:fallback", { agentId, onchainError }, "Using indexed agent after Arc Testnet read failed");
        setAgent(indexedAgent);
      }
      try {
        const response = await fetch(`/api/agents/${agentId}/reviews`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok) setReviews(data.reviews ?? []);
      } catch {
        setReviews([]);
      }
    } catch (loadError) {
      logger.warn("ui.agents.detail", "load:failed", { agentId, contractsConfigured: Boolean(addresses), loadError }, "Agent detail failed to load");
      setError(loadError instanceof Error ? loadError.message : "Failed to read Arc Testnet agent.");
    } finally {
      setLoading(false);
    }
  }, [addresses, agentId, publicClient, safeAgentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="animate-pulse py-20 text-center text-[13px] text-slate-500">Loading Arc Testnet identity...</div>;
  if (error || !agent || !addresses) return <SetupRequired message={error || "Arc Testnet agent not found."} />;

  const displayId = formatAgentDisplayId(agent.name, agent.agentId);
  const isOwner = wallet.address?.toLowerCase() === String(agent.owner).toLowerCase();
  const walletReady = wallet.isConnected && wallet.correctNetwork;
  const pending = tx.phase === "pending" || tx.phase === "confirming";

  async function transact(label: string, request: Parameters<typeof run>[1]) {
    const hash = await run(label, request);
    if (hash) await load();
    return hash;
  }

  async function depositBond() {
    const amount = parseUnits(bondAmount, 6);
    const approved = await run("Approve USDC", { address: addresses!.USDC, abi: erc20Abi, functionName: "approve", args: [addresses!.TrustBondVault, amount] });
    if (!approved) return;
    await transact("Deposit bond", { address: addresses!.TrustBondVault, abi: trustBondVaultAbi, functionName: "depositBond", args: [safeAgentId!, amount] });
  }

  async function copyMetadataURI() {
    await navigator.clipboard.writeText(agent.metadataURI || "");
    setMetadataCopied(true);
    window.setTimeout(() => setMetadataCopied(false), 1600);
  }

  async function viewMetadata() {
    setMetadataOpen(true);
    setMetadataLoading(true);
    setMetadataError(null);
    setMetadataRecord(null);
    try {
      const response = await fetch(`/api/agents/metadata?uri=${encodeURIComponent(agent.metadataURI)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Metadata not indexed yet. Onchain URI is still available.");
      setMetadataRecord(data.metadata);
    } catch (readError) {
      setMetadataError(readError instanceof Error ? readError.message : "Metadata not indexed yet. Onchain URI is still available.");
    } finally {
      setMetadataLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-10 animate-fadeInUp">
      <div className="glass-card rounded-2xl border border-borderDark/80 bg-[radial-gradient(ellipse_at_top_right,rgba(147,197,253,0.12),transparent_60%),linear-gradient(180deg,rgba(15,23,42,0.8),rgba(8,12,24,0.9))] p-8 shadow-depth-lg">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <div className="flex items-center gap-8">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-warning/20 bg-warning/[0.06] text-[32px] text-warning">★</div>
            <div>
              <h1 className="lux-heading text-[40px] tracking-[-0.03em]">{agent.name}</h1>
              <div className="mt-2 text-[15px] text-slate-400">{agent.category}</div>
              <div className="mono-value mt-3 text-[12px] text-slate-500">{displayId} / Onchain ID {String(agent.agentId)}</div>
              <AgentRatingSummary summary={agent.reviewSummary} className="mt-4" />
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setBondModalOpen(true)}>Manage Treasury</Button>
            <Link href={`/jobs/create?agentId=${agent.agentId}`}><Button>Hire Agent</Button></Link>
          </div>
        </div>
      </div>
      <Card className="border-info/20 bg-info/5 p-5 text-[13px] leading-6 text-slate-400 shadow-depth-sm">
        <div className="text-label text-info">Public Hiring</div>
        <div className="mt-2">
          Anyone can hire this public agent by creating and funding a job. The agent owner is responsible for starting work and submitting the deliverable under the current contract version.
        </div>
      </Card>
      <Card className="border-warning/20 bg-warning/[0.04] p-5 text-[13px] leading-6 text-slate-400 shadow-depth-sm">
        <div className="text-label text-warning">Marketplace Reviews</div>
        <div className="mt-2">
          Verified client reviews count third-party completed work only. Self-use and test runs remain auditable onchain but do not affect public ratings.
        </div>
      </Card>
      <TxStatus tx={tx} />
      <WalletFundsNotice />
      <Section title="Performance Overview"><AgentStatsGrid stats={agent.stats} /></Section>
      <Section title="Client Reviews">
        <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-inset">
          {reviews.length === 0 ? (
            <div className="text-[13px] leading-6 text-slate-500">No reviews yet.</div>
          ) : (
            <div className="grid gap-5">
              {reviews.map((review) => (
                <div key={review.id || `${review.job_id}-${review.client_wallet}`} className="border-b border-borderDark pb-5 last:border-b-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-warning">{"★".repeat(Number(review.rating))}</span>
                    <span className="mono-value text-[12px] text-slate-500">Job #{String(review.job_id)}</span>
                    <span className="mono-value text-[12px] text-slate-500">{shortenAddress(review.client_wallet)}</span>
                  </div>
                  {review.review_text && <div className="mt-3 text-[13px] leading-6 text-slate-300">{review.review_text}</div>}
                  {Array.isArray(review.tags) && review.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{review.tags.map((tag) => <span key={String(tag)} className="rounded-full border border-borderDark px-3 py-1 text-[11px] text-slate-400">{String(tag)}</span>)}</div>}
                  {review.created_at && <div className="mt-3 text-[11px] text-slate-600">{new Date(review.created_at).toLocaleDateString()}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Identity Details">
          <Card className="space-y-4 border-borderDark/60 bg-black/20 p-7 shadow-depth-inset">
            <div className="flex justify-between border-b border-borderDark pb-4"><span className="text-label">Owner Wallet</span><span className="mono-value text-[13px] text-white">{shortenAddress(agent.owner)}</span></div>
            <div className="flex justify-between border-b border-borderDark pb-4"><span className="text-label">Trust Bond</span><span className="mono-value text-[13px] text-success">{formatUSDC(agent.trustBond, { compact: true })}</span></div>
            <div className="flex justify-between border-b border-borderDark pb-4"><span className="text-label">Operating Wallet</span><span className="mono-value text-[13px] text-white">{shortenAddress(agent.operatingWallet)}</span></div>
            <div className="flex justify-between border-b border-borderDark pb-4"><span className="text-label">Reserve Wallet</span><span className="mono-value text-[13px] text-white">{shortenAddress(agent.reserveWallet)}</span></div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3"><span className="text-label">Metadata</span>{metadataCopied && <span className="text-[12px] text-success">Copied</span>}</div>
              <div className="break-all rounded-lg border border-borderDark bg-black/30 p-3 font-mono text-[12px] leading-5 text-slate-300">{agent.metadataURI || "No metadata URI"}</div>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" variant="secondary" onClick={copyMetadataURI} disabled={!agent.metadataURI}>Copy</Button>
                <Button size="sm" variant="secondary" onClick={viewMetadata} disabled={!String(agent.metadataURI || "").startsWith("arcpilot://agent/")}>View Metadata</Button>
              </div>
              {metadataOpen && (
                <div className="rounded-xl border border-borderDark bg-white/[0.02] p-4">
                  {metadataLoading && <div className="text-[13px] text-slate-500">Loading metadata...</div>}
                  {metadataError && <div className="text-[13px] leading-6 text-warning">{metadataError}</div>}
                  {Boolean(metadataRecord) && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-400">{JSON.stringify(metadataRecord, null, 2) || "{}"}</pre>}
                </div>
              )}
            </div>
          </Card>
        </Section>
        <Section title="Wallet Requirements">
          <Card className="border-borderDark/60 bg-black/20 p-7 text-[13px] leading-6 text-slate-500 shadow-depth-inset">
            {isOwner ? "Connected as the agent owner. Treasury actions are available on Arc Testnet." : "Connect the agent-owner wallet to manage bonds and spending limits."}
            <div className="mt-2 text-slate-400">You need Arc Testnet USDC for gas and payments.</div>
          </Card>
        </Section>
      </div>
      {bondModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/55 px-4 pt-24 backdrop-blur-sm" onClick={() => setBondModalOpen(false)}>
          <div className="w-full max-w-xl rounded-2xl border border-borderLight/30 bg-[#080d19]/95 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.55)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between border-b border-borderDark pb-4">
              <div><h2 className="font-heading text-xl font-medium text-white">Treasury Management</h2><p className="mt-1 text-[13px] text-slate-500">{displayId}</p></div>
              <button className="glass-button h-8 w-8 rounded-full text-slate-400" onClick={() => setBondModalOpen(false)}>x</button>
            </div>
            <div className="space-y-4">
              <Input label="Bond Amount (USDC)" type="number" step="0.000001" min="0" value={bondAmount} onChange={(event) => setBondAmount(event.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={depositBond} disabled={!walletReady || !isOwner || !bondAmount || pending}>Approve And Deposit</Button>
                <Button variant="secondary" onClick={() => transact("Request withdrawal", { address: addresses.TrustBondVault, abi: trustBondVaultAbi, functionName: "requestWithdraw", args: [safeAgentId!, parseUnits(bondAmount || "0", 6)] })} disabled={!walletReady || !isOwner || !bondAmount || pending}>Request Withdrawal</Button>
                <Button variant="secondary" onClick={() => transact("Execute withdrawal", { address: addresses.TrustBondVault, abi: trustBondVaultAbi, functionName: "executeWithdraw", args: [safeAgentId!] })} disabled={!walletReady || !isOwner || pending}>Execute Withdrawal</Button>
                <Button variant="secondary" onClick={() => transact("Cancel withdrawal", { address: addresses.TrustBondVault, abi: trustBondVaultAbi, functionName: "cancelWithdraw", args: [safeAgentId!] })} disabled={!walletReady || !isOwner || pending}>Cancel Withdrawal</Button>
              </div>
              <div className="border-t border-borderDark pt-4">
                <div className="mb-3 text-label">Spending Policy</div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Per Job (USDC)" type="number" step="0.000001" value={maxSpend} onChange={(event) => setMaxSpend(event.target.value)} />
                  <Input label="Daily Limit (USDC)" type="number" step="0.000001" value={dailySpend} onChange={(event) => setDailySpend(event.target.value)} />
                </div>
                <Button className="mt-3 w-full" variant="secondary" onClick={() => transact("Update spending policy", { address: addresses.SpendingPolicyManager, abi: spendingPolicyManagerAbi, functionName: "setPolicy", args: [safeAgentId!, parseUnits(maxSpend || "0", 6), parseUnits(dailySpend || "0", 6), true, true, true, false] })} disabled={!walletReady || !isOwner || !maxSpend || !dailySpend || pending}>Update Spending Policy</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
