"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { parseUnits } from "viem";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "../../../lib/chains/arc-testnet";
import { disputeManagerAbi } from "../../../lib/contracts/browser-abis";
import { getBrowserContractAddresses } from "../../../lib/contracts/browser-addresses";
import { decodeBrowserJobURI, readAgentView, readDisputeView, readJobView } from "../../../lib/contracts/browser-read";
import { useArcTransaction } from "../../../lib/contracts/hooks";
import { useWalletSession } from "../../../lib/auth/use-wallet-session";
import { shortenAddress } from "../../../lib/design/copy";
import { formatUSDC } from "../../../lib/format/usdc";
import { AIDisputeReviewCard, type AIDisputeReviewView } from "../../../components/disputes/AIDisputeReviewCard";
import { DisputeOutcomeBadge } from "../../../components/disputes/DisputeOutcomeBadge";
import { ManualReviewRequest } from "../../../components/disputes/ManualReviewRequest";
import { DeliverableViewer } from "../../../components/jobs/DeliverableViewer";
import { SetupRequired } from "../../../components/layout/SetupRequired";
import { TxStatus } from "../../../components/shared/TxStatus";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Section } from "../../../components/ui/Section";
import { toBigIntSafe } from "../../../lib/format/ids";
import { logger } from "../../../lib/logger";

export default function DisputeDetails() {
  const params = useParams();
  const disputeId = params?.disputeId as string;
  const safeDisputeId = toBigIntSafe(disputeId);
  const addresses = getBrowserContractAddresses();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { tx, run, wallet } = useArcTransaction();
  const walletSession = useWalletSession();
  const [dispute, setDispute] = useState<any>(null);
  const [disputeMetadata, setDisputeMetadata] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [authorizedResolver, setAuthorizedResolver] = useState(false);
  const [evidenceURI, setEvidenceURI] = useState("");
  const [slashAmount, setSlashAmount] = useState("0");
  const [agentBps, setAgentBps] = useState("5000");
  const [clientBps, setClientBps] = useState("5000");
  const [aiReview, setAIReview] = useState<AIDisputeReviewView | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [manualRequest, setManualRequest] = useState<{ reason: string; status: string } | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deliverablePreview, setDeliverablePreview] = useState<{ generated_title?: string; executive_summary?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!safeDisputeId) throw new Error("Invalid dispute ID.");
      let nextDispute: any = null;
      try {
        const response = await fetch(`/api/disputes/${disputeId}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.dispute) nextDispute = data.dispute;
      } catch (apiError) {
        logger.warn("ui.disputes.detail", "indexedRead:failed", { disputeId, apiError }, "Indexed dispute fallback is unavailable");
      }
      if (publicClient && addresses) {
        try {
          nextDispute = await readDisputeView(publicClient, addresses, safeDisputeId);
        } catch (onchainError) {
          if (!nextDispute) throw onchainError;
          logger.warn("ui.disputes.detail", "onchainRead:fallback", { disputeId, onchainError }, "Using indexed dispute after Arc Testnet read failed");
        }
      }
      if (!nextDispute) throw new Error(addresses ? "Arc Testnet dispute not found." : "Arc Testnet contracts not configured.");
      let nextJob: any = null;
      try {
        const response = await fetch(`/api/jobs/${String(nextDispute.jobId)}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.job) nextJob = data.job;
      } catch (apiError) {
        logger.warn("ui.disputes.detail", "jobIndexedRead:failed", { disputeId, jobId: String(nextDispute.jobId), apiError }, "Indexed job fallback is unavailable");
      }
      if (publicClient && addresses) {
        try {
          nextJob = await readJobView(publicClient, addresses, BigInt(nextDispute.jobId));
        } catch (onchainError) {
          if (!nextJob) throw onchainError;
          logger.warn("ui.disputes.detail", "jobOnchainRead:fallback", { disputeId, jobId: String(nextDispute.jobId), onchainError }, "Using indexed job after Arc Testnet read failed");
        }
      }
      if (!nextJob) throw new Error("Linked job could not be loaded.");
      let nextAgent: any = null;
      try {
        const response = await fetch(`/api/agents/${String(nextJob.agentId)}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.agent) nextAgent = data.agent;
      } catch (apiError) {
        logger.warn("ui.disputes.detail", "agentIndexedRead:failed", { disputeId, agentId: String(nextJob.agentId), apiError }, "Indexed agent fallback is unavailable");
      }
      if (publicClient && addresses) {
        try {
          nextAgent = await readAgentView(publicClient, addresses, BigInt(nextJob.agentId));
        } catch (onchainError) {
          if (!nextAgent) throw onchainError;
          logger.warn("ui.disputes.detail", "agentOnchainRead:fallback", { disputeId, agentId: String(nextJob.agentId), onchainError }, "Using indexed agent after Arc Testnet read failed");
        }
      }
      if (!nextAgent) throw new Error("Assigned agent could not be loaded.");
      let resolver = false;
      if (wallet.address && publicClient && addresses) {
        const [listed, owner] = await Promise.all([
          publicClient.readContract({ address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "resolvers", args: [wallet.address] }),
          publicClient.readContract({ address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "owner" })
        ]);
        resolver = Boolean(listed) || String(owner).toLowerCase() === wallet.address.toLowerCase();
      }

      setDispute(nextDispute);
      setJob(nextJob);
      setAgent(nextAgent);
      setAuthorizedResolver(resolver);
      setEvidenceURI(nextDispute.evidenceURI || "");

      const [metadataResponse, reviewResponse, manualResponse] = await Promise.all([
        nextDispute.reasonURI?.startsWith("arcpilot://dispute/")
          ? fetch(`/api/disputes/metadata?reasonUri=${encodeURIComponent(nextDispute.reasonURI)}`)
          : Promise.resolve(null),
        fetch(`/api/disputes/${disputeId}/ai-review`, { cache: "no-store" }),
        fetch(`/api/disputes/${disputeId}/manual-review`, { cache: "no-store" })
      ]);
      let nextDisputeMetadata: any = null;
      if (metadataResponse?.ok) {
        const data = await metadataResponse.json();
        nextDisputeMetadata = data.metadata ?? data;
        setDisputeMetadata(nextDisputeMetadata);
      }
      if (reviewResponse.ok) {
        const data = await reviewResponse.json();
        const review = data.review as AIDisputeReviewView | null;
        setAIReview(review);
        if (review) {
          setSlashAmount(review.slash_amount || "0");
          setAgentBps(String(review.agent_bps || 0));
          setClientBps(String(review.client_bps || 0));
        }
      } else {
        const data = await reviewResponse.json().catch(() => ({}));
        setAIError(data.error || "AI dispute review could not be loaded.");
      }
      if (manualResponse.ok) {
        const data = await manualResponse.json();
        setManualRequest(data.request ?? null);
      }
      const deliverableURI = nextDisputeMetadata?.deliverable_uri || nextJob.deliverableURI || "";
      const deliverableHash = deliverableURI.startsWith("local-deliverable://")
        ? deliverableURI.slice("local-deliverable://".length)
        : "";
      if (/^0x[a-fA-F0-9]{64}$/.test(deliverableHash)) {
        // Do not bypass deliverable API access control. The API reads the verified httpOnly wallet session.
        const previewResponse = await fetch(`/api/deliverables/${deliverableHash}`, { cache: "no-store" });
        const previewData = await previewResponse.json();
        setDeliverablePreview(previewResponse.ok && previewData?.deliverable ? previewData.deliverable : null);
      } else {
        setDeliverablePreview(null);
      }
    } catch (loadError) {
      logger.warn("ui.disputes.detail", "load:failed", { disputeId, contractsConfigured: Boolean(addresses), loadError }, "Dispute detail failed to load");
      setError(loadError instanceof Error ? loadError.message : "Failed to read Arc Testnet dispute.");
    } finally {
      setLoading(false);
    }
  }, [addresses, disputeId, publicClient, safeDisputeId, wallet.address, walletSession.verifiedWallet]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="animate-pulse py-20 text-center text-[13px] text-slate-500">Loading Arc Testnet dispute...</div>;
  if (error || !dispute || !job || !agent || !addresses) return <SetupRequired message={error || "Arc Testnet dispute not found."} />;

  const walletAddress = wallet.address?.toLowerCase();
  const participant = walletAddress === String(dispute.openedBy).toLowerCase() || walletAddress === String(job.client).toLowerCase() || walletAddress === String(job.evaluator).toLowerCase() || walletAddress === String(agent.owner).toLowerCase();
  const walletReady = wallet.isConnected && wallet.correctNetwork;
  const pending = tx.phase === "pending" || tx.phase === "confirming";
  const decodedJob = decodeBrowserJobURI(job.jobURI);
  const deliverableURI = disputeMetadata?.deliverable_uri || job.deliverableURI || "";
  const resolverDisabled = !walletReady || !authorizedResolver || dispute.resolved || pending;
  const manualDisabledReason = !wallet.isConnected
    ? "Connect a dispute participant wallet to request manual review."
    : !wallet.correctNetwork
      ? "Switch to Arc Testnet to request manual review."
      : !participant
        ? "Only the client, evaluator, agent owner, or dispute opener can request manual review."
        : manualReason.trim().length < 20
          ? "Enter at least 20 characters explaining the appeal."
          : null;

  async function transact(label: string, request: Parameters<typeof run>[1]) {
    const hash = await run(label, request);
    if (hash) await load();
    return hash;
  }

  async function runAIReview(forceRegenerate: boolean) {
    setAILoading(true);
    setAIError(null);
    try {
      const response = await fetch(`/api/disputes/${disputeId}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceRegenerate })
      });
      const data = await response.json();
      if (!response.ok || !data.review) throw new Error(data.error || "AI dispute review failed.");
      setAIReview(data.review);
      setSlashAmount(data.review.slash_amount || "0");
      setAgentBps(String(data.review.agent_bps || 0));
      setClientBps(String(data.review.client_bps || 0));
    } catch (reviewError) {
      setAIError(reviewError instanceof Error ? reviewError.message : "AI dispute review failed.");
    } finally {
      setAILoading(false);
    }
  }

  async function requestManualReview() {
    setManualLoading(true);
    setManualError(null);
    try {
      const response = await fetch(`/api/disputes/${disputeId}/manual-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedByWallet: wallet.address, reason: manualReason })
      });
      const data = await response.json();
      if (!response.ok || !data.request) throw new Error(data.error || "Manual review request failed.");
      setManualRequest(data.request);
    } catch (manualReviewError) {
      setManualError(manualReviewError instanceof Error ? manualReviewError.message : "Manual review request failed.");
    } finally {
      setManualLoading(false);
    }
  }

  async function executeAIRecommendation() {
    if (!aiReview) return;
    if (aiReview.recommended_outcome === "agent_wins") {
      await transact("Execute AI recommendation: agent wins", { address: addresses!.DisputeManager, abi: disputeManagerAbi, functionName: "resolveAgentWins", args: [safeDisputeId!] });
    } else if (aiReview.recommended_outcome === "client_wins") {
      await transact("Execute AI recommendation: client wins", { address: addresses!.DisputeManager, abi: disputeManagerAbi, functionName: "resolveClientWins", args: [safeDisputeId!, parseUnits(aiReview.slash_amount || "0", 6)] });
    } else if (aiReview.recommended_outcome === "split") {
      await transact("Execute AI recommendation: split", { address: addresses!.DisputeManager, abi: disputeManagerAbi, functionName: "resolveSplit", args: [safeDisputeId!, BigInt(aiReview.agent_bps || 0), BigInt(aiReview.client_bps || 0)] });
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 animate-fadeInUp">
      <div className="relative flex flex-col justify-between gap-6 border-b border-borderDark/60 pb-8 md:flex-row md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-4"><h1 className="lux-heading text-[36px] tracking-[-0.03em]">Dispute #{String(dispute.disputeId)}</h1><DisputeOutcomeBadge outcome={Number(dispute.outcome)} /></div>
          <div className="mono-value mt-3 text-[12px] text-slate-500">Opened by {shortenAddress(dispute.openedBy)}</div>
        </div>
        <Link href={`/jobs/${dispute.jobId}`}><Button variant="ghost">View Job</Button></Link>
      </div>

      <TxStatus tx={tx} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Dispute Overview">
          <Card className="space-y-5 border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><div className="text-label">Job ID</div><div className="mono-value mt-2 text-[14px] text-accent">#{String(dispute.jobId)}</div></div>
              <div><div className="text-label">Status</div><div className="mt-2 text-[14px] text-white">{dispute.resolved ? "Resolved" : "Open"}</div></div>
              <div><div className="text-label">Evidence</div><div className="mt-2 text-[14px] text-white">{dispute.evidenceURI ? "Submitted" : "Not submitted"}</div></div>
            </div>
            <div><div className="text-label">Original Job Request</div><div className="mt-3 rounded-xl border border-borderDark/60 bg-black/30 p-4 text-[13px] leading-6 text-slate-300">{decodedJob?.title && <div className="mb-2 font-medium text-white">{decodedJob.title}</div>}{decodedJob?.description || job.jobURI}</div></div>
            <div><div className="text-label">Rejection Reason</div><div className="mt-3 rounded-xl border border-borderDark/60 bg-black/30 p-4 text-[13px] leading-6 text-slate-300">{disputeMetadata?.reason || dispute.reasonURI || "No readable reason was provided."}</div></div>
            {disputeMetadata?.category && <div><div className="text-label">Reason Category</div><div className="mt-2 text-[13px] text-slate-300">{disputeMetadata.category}</div></div>}
          </Card>
        </Section>
        <Section title="Escrow Context">
          <Card className="space-y-4 border-borderDark/60 bg-black/20 p-6 shadow-depth-md">
            <div><div className="text-label">Agent</div><div className="mt-2 text-[14px] text-white">{agent.name}</div></div>
            <div><div className="text-label">Escrow Amount</div><div className="mono-value mt-2 text-[18px] text-success">{formatUSDC(job.amount, { compact: true })}</div></div>
            <div><div className="text-label">Client Bond</div><div className="mono-value mt-2 text-[16px] text-warning">{formatUSDC(job.clientBond, { compact: true })}</div></div>
            <div><div className="text-label">Evidence URI</div><div className="mono-value mt-2 break-all text-[11px] leading-5 text-slate-400">{dispute.evidenceURI || "Not submitted"}</div></div>
          </Card>
        </Section>
      </div>

      {deliverableURI && (
        <Section title="Deliverable Under Review">
          <Card className="border-warning/20 bg-warning/[0.035] p-7 shadow-depth-md">
            <div className="text-label text-warning">Protected Dispute Preview</div>
            <h2 className="mt-3 font-heading text-[24px] tracking-[-0.02em] text-white">{deliverablePreview?.generated_title || decodedJob?.title || "Submitted deliverable"}</h2>
            <p className="mt-3 max-w-4xl text-[14px] leading-7 text-slate-400">
              {deliverablePreview?.executive_summary || "This deliverable is currently under dispute. Full report access depends on the final resolution."}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <DeliverableViewer deliverableURI={deliverableURI} label="View Preview" />
              <span className="mono-value break-all text-[11px] text-slate-500">{deliverableURI}</span>
            </div>
          </Card>
        </Section>
      )}

      <Section title="AI Dispute Resolver">
        <AIDisputeReviewCard review={aiReview} loading={aiLoading} error={aiError} onRun={runAIReview} />
      </Section>

      {aiReview && (
        <Section title="Execute Resolution">
          <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
            <div className="mb-5 text-[13px] leading-6 text-slate-500">
              {authorizedResolver ? "AI Dispute Resolver has reviewed this case. The connected resolver/admin wallet can execute the recommended onchain resolution or choose a manual outcome." : "AI Dispute Resolver has reviewed this case. Connect resolver/admin wallet to execute the recommended onchain resolution."}
            </div>
            <div className="mb-5">
              <Button onClick={executeAIRecommendation} disabled={resolverDisabled || aiReview.recommended_outcome === "manual_review_required"}>Execute AI Recommendation</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Button variant="success" onClick={() => transact("Resolve agent wins", { address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "resolveAgentWins", args: [safeDisputeId!] })} disabled={resolverDisabled}>Resolve Agent Wins</Button>
              <div><Input label="Slash Amount (USDC)" type="number" step="0.000001" min="0" value={slashAmount} onChange={(event) => setSlashAmount(event.target.value)} /><Button className="mt-3 w-full" variant="danger" onClick={() => transact("Resolve client wins", { address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "resolveClientWins", args: [safeDisputeId!, parseUnits(slashAmount || "0", 6)] })} disabled={resolverDisabled}>Resolve Client Wins</Button></div>
              <div><div className="grid grid-cols-2 gap-3"><Input label="Agent BPS" type="number" value={agentBps} onChange={(event) => setAgentBps(event.target.value)} /><Input label="Client BPS" type="number" value={clientBps} onChange={(event) => setClientBps(event.target.value)} /></div><Button className="mt-3 w-full" variant="secondary" onClick={() => transact("Resolve split", { address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "resolveSplit", args: [safeDisputeId!, BigInt(agentBps), BigInt(clientBps)] })} disabled={resolverDisabled || Number(agentBps) + Number(clientBps) !== 10000}>Resolve Split</Button></div>
            </div>
          </Card>
        </Section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Submit Evidence">
          <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
            <Input label="Evidence URI" placeholder="ipfs://..." value={evidenceURI} onChange={(event) => setEvidenceURI(event.target.value)} />
            <Button className="mt-4 w-full" onClick={() => transact("Submit evidence", { address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "submitEvidence", args: [safeDisputeId!, evidenceURI] })} disabled={!walletReady || !participant || dispute.resolved || !evidenceURI || pending}>Submit Evidence</Button>
            {!participant && <div className="mt-3 text-[12px] leading-5 text-slate-500">Only a dispute participant can submit evidence.</div>}
          </Card>
        </Section>
        {aiReview && (
          <Section title="Manual Review / Appeal">
            <ManualReviewRequest existingRequest={manualRequest} reason={manualReason} onReasonChange={setManualReason} onSubmit={requestManualReview} loading={manualLoading} error={manualError} disabledReason={manualDisabledReason} />
          </Section>
        )}
      </div>
    </div>
  );
}
