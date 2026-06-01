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
import { isResolverAdminWallet } from "../../../lib/auth/resolver";
import { formatUSDC } from "../../../lib/format/usdc";
import { toBigIntSafe } from "../../../lib/format/ids";
import { logger } from "../../../lib/logger";
import type { DisputeEvidenceRow, ManualReviewRequestRow } from "../../../lib/supabase/types";
import { AIDisputeReviewCard, type AIDisputeReviewView } from "../../../components/disputes/AIDisputeReviewCard";
import { DisputeOutcomeBadge } from "../../../components/disputes/DisputeOutcomeBadge";
import { EvidenceForm } from "../../../components/disputes/EvidenceForm";
import { ManualReviewQueue } from "../../../components/disputes/ManualReviewQueue";
import { ManualReviewRequest } from "../../../components/disputes/ManualReviewRequest";
import { ResolverActions } from "../../../components/disputes/ResolverActions";
import { DeliverableViewer } from "../../../components/jobs/DeliverableViewer";
import { SetupRequired } from "../../../components/layout/SetupRequired";
import { TxStatus } from "../../../components/shared/TxStatus";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Section } from "../../../components/ui/Section";

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
  const [evidenceText, setEvidenceText] = useState("");
  const [supportingLink, setSupportingLink] = useState("");
  const [evidenceRows, setEvidenceRows] = useState<DisputeEvidenceRow[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [slashAmount, setSlashAmount] = useState("0");
  const [agentBps, setAgentBps] = useState("5000");
  const [clientBps, setClientBps] = useState("5000");
  const [aiReview, setAIReview] = useState<AIDisputeReviewView | null>(null);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [reReviewUsed, setReReviewUsed] = useState(false);
  const [newEvidenceAvailable, setNewEvidenceAvailable] = useState(false);
  const [reReviewReason, setReReviewReason] = useState("");
  const [manualRequest, setManualRequest] = useState<ManualReviewRequestRow | null>(null);
  const [manualRequests, setManualRequests] = useState<ManualReviewRequestRow[]>([]);
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

      setDispute(nextDispute);
      setJob(nextJob);
      setAgent(nextAgent);

      const [metadataResponse, reviewResponse, manualResponse, evidenceResponse] = await Promise.all([
        nextDispute.reasonURI?.startsWith("arcpilot://dispute/")
          ? fetch(`/api/disputes/metadata?reasonUri=${encodeURIComponent(nextDispute.reasonURI)}`)
          : Promise.resolve(null),
        fetch(`/api/disputes/${disputeId}/ai-review`, { cache: "no-store" }),
        fetch(`/api/disputes/${disputeId}/manual-review`, { cache: "no-store" }),
        fetch(`/api/disputes/${disputeId}/evidence`, { cache: "no-store" })
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
        setReReviewUsed(Boolean(data.reReviewUsed));
        setNewEvidenceAvailable(Boolean(data.newEvidenceAvailable));
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
        setManualRequests(data.requests ?? []);
      }
      if (evidenceResponse.ok) {
        const data = await evidenceResponse.json();
        setEvidenceRows(data.evidence ?? []);
      } else {
        const data = await evidenceResponse.json().catch(() => ({}));
        setEvidenceError(data.error || "Dispute evidence could not be loaded.");
      }

      const deliverableURI = nextDisputeMetadata?.deliverable_uri || nextJob.deliverableURI || "";
      const deliverableHash = deliverableURI.startsWith("local-deliverable://")
        ? deliverableURI.slice("local-deliverable://".length)
        : "";
      if (/^0x[a-fA-F0-9]{64}$/.test(deliverableHash)) {
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
  }, [addresses, disputeId, publicClient, safeDisputeId, walletSession.verifiedWallet]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="animate-pulse py-20 text-center text-[13px] text-slate-500">Loading Arc Testnet dispute...</div>;
  if (error || !dispute || !job || !agent || !addresses) return <SetupRequired message={error || "Arc Testnet dispute not found."} />;

  const walletAddress = wallet.address?.toLowerCase();
  const participant = walletAddress === String(job.client).toLowerCase() || walletAddress === String(job.evaluator).toLowerCase() || walletAddress === String(agent.owner).toLowerCase();
  const walletReady = wallet.isConnected && wallet.correctNetwork;
  const resolverWalletConnected = isResolverAdminWallet(wallet.address);
  const resolverSessionVerified = resolverWalletConnected
    && walletSession.matchesConnectedWallet
    && isResolverAdminWallet(walletSession.verifiedWallet);
  const pending = tx.phase === "pending" || tx.phase === "confirming";
  const decodedJob = decodeBrowserJobURI(job.jobURI);
  const deliverableURI = disputeMetadata?.deliverable_uri || job.deliverableURI || "";
  const resolverDisabled = !walletReady || !resolverSessionVerified || dispute.resolved || pending;
  const sessionReady = walletSession.matchesConnectedWallet;
  const participantDisabledReason = !wallet.isConnected
    ? "Connect a dispute participant wallet to continue."
    : !wallet.correctNetwork
      ? "Switch to Arc Testnet to continue."
      : !participant
        ? "Only the client, evaluator, or agent owner can continue."
        : !sessionReady
          ? "Verify your connected wallet session before continuing."
          : null;
  const evidenceDisabledReason = participantDisabledReason
    || (dispute.resolved ? "This dispute is already resolved." : null)
    || (evidenceText.trim().length < 20 ? "Enter at least 20 characters of evidence." : null)
    || (pending ? "Wait for the current transaction to settle." : null);
  const manualDisabledReason = participantDisabledReason
    || (manualReason.trim().length < 20 ? "Enter at least 20 characters explaining the appeal." : null);

  async function transact(label: string, request: Parameters<typeof run>[1]) {
    const hash = await run(label, request);
    if (hash) await load();
    return hash;
  }

  async function runAIReview(requestReReview: boolean) {
    setAILoading(true);
    setAIError(null);
    try {
      const response = await fetch(`/api/disputes/${disputeId}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestReReview, manualAppeal: reReviewReason })
      });
      const data = await response.json();
      if (!response.ok || !data.review) throw new Error(data.error || "AI dispute review failed.");
      setAIReview(data.review);
      setReReviewUsed(Boolean(data.reReviewUsed));
      setNewEvidenceAvailable(Boolean(data.newEvidenceAvailable));
      setSlashAmount(data.review.slash_amount || "0");
      setAgentBps(String(data.review.agent_bps || 0));
      setClientBps(String(data.review.client_bps || 0));
      if (requestReReview) setReReviewReason("");
    } catch (reviewError) {
      setAIError(reviewError instanceof Error ? reviewError.message : "AI dispute review failed.");
    } finally {
      setAILoading(false);
    }
  }

  async function submitEvidence() {
    setEvidenceLoading(true);
    setEvidenceError(null);
    try {
      const metadataResponse = await fetch(`/api/disputes/${disputeId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceText, supportingLink })
      });
      const metadata = await metadataResponse.json();
      if (!metadataResponse.ok || !metadata.evidenceURI) throw new Error(metadata.error || "Unable to save dispute evidence.");
      const hash = await run("Submit evidence", {
        address: addresses!.DisputeManager,
        abi: disputeManagerAbi,
        functionName: "submitEvidence",
        args: [safeDisputeId!, metadata.evidenceURI]
      });
      if (!hash) return;
      const linkResponse = await fetch(`/api/disputes/${disputeId}/evidence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceURI: metadata.evidenceURI, txHash: hash })
      });
      const linked = await linkResponse.json();
      if (!linkResponse.ok) throw new Error(linked.error || "Evidence was submitted onchain but its transaction link could not be saved.");
      setEvidenceText("");
      setSupportingLink("");
      await load();
    } catch (submitError) {
      setEvidenceError(submitError instanceof Error ? submitError.message : "Unable to submit dispute evidence.");
    } finally {
      setEvidenceLoading(false);
    }
  }

  async function requestManualReview() {
    setManualLoading(true);
    setManualError(null);
    try {
      const response = await fetch(`/api/disputes/${disputeId}/manual-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: manualReason })
      });
      const data = await response.json();
      if (!response.ok || !data.request) throw new Error(data.error || "Manual review request failed.");
      setManualRequest(data.request);
      setManualReason("");
      await load();
    } catch (manualReviewError) {
      setManualError(manualReviewError instanceof Error ? manualReviewError.message : "Manual review request failed.");
    } finally {
      setManualLoading(false);
    }
  }

  async function updateManualReview(requestId: string, status: "accepted" | "resolved" | "rejected", resolverNote: string) {
    setManualLoading(true);
    setManualError(null);
    try {
      const response = await fetch(`/api/disputes/${disputeId}/manual-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status, resolverNote })
      });
      const data = await response.json();
      if (!response.ok || !data.request) throw new Error(data.error || "Manual review queue update failed.");
      await load();
    } catch (manualReviewError) {
      setManualError(manualReviewError instanceof Error ? manualReviewError.message : "Manual review queue update failed.");
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

      {process.env.NODE_ENV === "development" && (
        <details className="rounded-xl border border-borderDark/50 bg-black/15 p-4">
          <summary className="cursor-pointer text-label text-slate-500">Resolver debug</summary>
          <div className="mono-value mt-3 grid gap-2 text-[11px] leading-5 text-slate-500">
            <div>connectedWallet: {wallet.address ? shortenAddress(wallet.address) : "not connected"}</div>
            <div>verifiedSessionWallet: {walletSession.verifiedWallet ? shortenAddress(walletSession.verifiedWallet) : "not verified"}</div>
            <div>isResolverAdmin: {resolverWalletConnected ? "true" : "false"}</div>
          </div>
        </details>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="Dispute Overview">
          <Card className="space-y-5 border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><div className="text-label">Job ID</div><div className="mono-value mt-2 text-[14px] text-accent">#{String(dispute.jobId)}</div></div>
              <div><div className="text-label">Status</div><div className="mt-2 text-[14px] text-white">{dispute.resolved ? "Resolved" : "Open"}</div></div>
              <div><div className="text-label">Evidence Records</div><div className="mono-value mt-2 text-[14px] text-white">{evidenceRows.length}</div></div>
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
            <details>
              <summary className="cursor-pointer text-label text-slate-500">Protocol URIs</summary>
              <div className="mono-value mt-3 grid gap-2 break-all text-[11px] leading-5 text-slate-500">
                <div>Reason: {dispute.reasonURI || "Not recorded"}</div>
                <div>Evidence: {dispute.evidenceURI || "Not submitted"}</div>
              </div>
            </details>
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

      <Section title="Submitted Evidence">
        <div className="grid gap-4">
          {evidenceRows.length === 0 ? (
            <Card className="border-dashed border-borderDark/80 bg-white/[0.01] p-7 text-[13px] text-slate-500">No readable evidence has been added yet.</Card>
          ) : evidenceRows.map((item) => (
            <Card key={item.evidence_uri} className="border-borderDark/60 bg-black/20 p-6 shadow-depth-md">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="mono-value text-[11px] text-slate-500">{shortenAddress(item.submitted_by_wallet || "")}</div>
                <div className="text-[11px] text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString() : "Timestamp pending"}</div>
              </div>
              <p className="mt-4 text-[13px] leading-6 text-slate-300">{item.evidence_text}</p>
              {item.supporting_link && <a className="mt-4 inline-block text-[12px] text-accent hover:text-white" href={item.supporting_link} target="_blank" rel="noreferrer">Open supporting link</a>}
            </Card>
          ))}
        </div>
      </Section>

      <Section title="AI Dispute Resolver">
        <AIDisputeReviewCard
          review={aiReview}
          loading={aiLoading}
          error={aiError}
          onRun={runAIReview}
          reReviewUsed={reReviewUsed}
          newEvidenceAvailable={newEvidenceAvailable}
          reReviewReason={reReviewReason}
          onReReviewReasonChange={setReReviewReason}
        />
      </Section>

      {aiReview && resolverSessionVerified ? (
        <Section title="Execute Resolution">
          <ResolverActions
            review={aiReview}
            disabled={resolverDisabled}
            slashAmount={slashAmount}
            agentBps={agentBps}
            clientBps={clientBps}
            onSlashAmountChange={setSlashAmount}
            onAgentBpsChange={setAgentBps}
            onClientBpsChange={setClientBps}
            onExecuteRecommendation={executeAIRecommendation}
            onResolveAgentWins={() => transact("Resolve agent wins", { address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "resolveAgentWins", args: [safeDisputeId!] })}
            onResolveClientWins={() => transact("Resolve client wins", { address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "resolveClientWins", args: [safeDisputeId!, parseUnits(slashAmount || "0", 6)] })}
            onResolveSplit={() => transact("Resolve split", { address: addresses.DisputeManager, abi: disputeManagerAbi, functionName: "resolveSplit", args: [safeDisputeId!, BigInt(agentBps), BigInt(clientBps)] })}
          />
        </Section>
      ) : aiReview && resolverWalletConnected ? (
        <Section title="Execute Resolution">
          <Card className="border-accent/20 bg-accent/[0.035] p-7 shadow-depth-md">
            <div className="text-label text-accent">Resolver Wallet Connected</div>
            <h2 className="mt-3 font-heading text-[22px] tracking-[-0.02em] text-white">Verify wallet session to unlock resolver controls.</h2>
            <p className="mt-3 text-[14px] leading-7 text-slate-400">
              Sign a wallet message to confirm this resolver session before executing any onchain resolution or updating the manual appeal queue.
            </p>
            {walletSession.error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-6 text-danger">{walletSession.error}</div>}
            <Button
              className="mt-5"
              onClick={() => void walletSession.signIn().catch(() => undefined)}
              disabled={walletSession.signing || !wallet.correctNetwork}
            >
              {walletSession.signing ? "Verifying..." : "Verify Wallet Session"}
            </Button>
          </Card>
        </Section>
      ) : aiReview ? (
        <Section title="Resolution Status">
          <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
            <div className="text-label text-warning">Resolver Review Pending</div>
            <p className="mt-3 text-[14px] leading-7 text-slate-400">
              AI recommendation is ready. Resolver/admin will execute final onchain resolution.
            </p>
          </Card>
        </Section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Submit Evidence">
          <EvidenceForm
            evidenceText={evidenceText}
            supportingLink={supportingLink}
            onEvidenceTextChange={setEvidenceText}
            onSupportingLinkChange={setSupportingLink}
            onSubmit={submitEvidence}
            loading={evidenceLoading}
            error={evidenceError}
            disabledReason={evidenceDisabledReason}
          />
        </Section>
        {aiReview && (
          <Section title="Manual Review / Appeal">
            <ManualReviewRequest
              existingRequest={manualRequest}
              reason={manualReason}
              onReasonChange={setManualReason}
              onSubmit={requestManualReview}
              loading={manualLoading}
              error={manualError}
              disabledReason={manualDisabledReason}
            />
          </Section>
        )}
      </div>

      {resolverSessionVerified && (
        <Section title="Manual Appeal Queue">
          <ManualReviewQueue requests={manualRequests} loading={manualLoading} error={manualError} onUpdate={updateManualReview} />
        </Section>
      )}
    </div>
  );
}
