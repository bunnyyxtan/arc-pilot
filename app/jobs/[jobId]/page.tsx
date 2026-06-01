"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePublicClient } from "wagmi";
import { arcTestnet } from "../../../lib/chains/arc-testnet";
import { agentJobEscrowAbi, erc20Abi } from "../../../lib/contracts/browser-abis";
import { getBrowserContractAddresses } from "../../../lib/contracts/browser-addresses";
import { decodeBrowserJobURI, readAgentView, readJobView } from "../../../lib/contracts/browser-read";
import { useArcTransaction } from "../../../lib/contracts/hooks";
import { useWalletSession } from "../../../lib/auth/use-wallet-session";
import { formatAgentDisplayId } from "../../../lib/design/agent-id";
import { shortenAddress } from "../../../lib/design/copy";
import { formatUSDC } from "../../../lib/format/usdc";
import { TxStatus } from "../../../components/shared/TxStatus";
import { DeliverableViewer } from "../../../components/jobs/DeliverableViewer";
import { JobTimeline } from "../../../components/jobs/JobTimeline";
import { JobStatusBadge } from "../../../components/jobs/JobStatusBadge";
import { DisputeConfirmModal } from "../../../components/jobs/DisputeConfirmModal";
import { JobFeedbackModal, type ReviewContext } from "../../../components/jobs/JobFeedbackModal";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Section } from "../../../components/ui/Section";
import { SetupRequired } from "../../../components/layout/SetupRequired";
import { WalletFundsNotice } from "../../../components/wallet/WalletFundsNotice";
import type { DeliverableType } from "../../../lib/openai/prompts";
import { toBigIntSafe } from "../../../lib/format/ids";
import { logger } from "../../../lib/logger";
import { getDisputeStatus } from "../../../lib/disputes/status";
import { isSelfUseJob, resolveJobClassification, shouldCountTowardPublicRatings } from "../../../lib/jobs/classification";
import { JOB_STATUS, normalizeJobStatus } from "../../../lib/jobs/status";

function detectDeliverableType(title: string, description: string): DeliverableType {
  const combined = `${title} ${description}`.toLowerCase();
  if (/\b(?:research|analyze|report|analysis|investigate|study|explore|overview)\b/.test(combined)) return "research";
  if (/\b(?:arc\b|arc\s+project|arc\s+network|arc\s+blockchain|arcpilot)\b/.test(combined)) return "research";
  if (/\b(?:write|content|post|blog|article|tweet|thread|copy)\b/.test(combined)) return "content";
  if (/\b(?:code|implement|build|develop|script|function|api|sdk)\b/.test(combined)) return "code";
  return "general";
}

function jsonSafe(value: any) {
  return JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
}

function deliverableHashFromURI(uri: string) {
  if (!uri.startsWith("local-deliverable://")) return null;
  const hash = uri.slice("local-deliverable://".length).trim();
  return /^0x[a-fA-F0-9]{64}$/.test(hash) ? hash : null;
}

type CompactDeliverable = {
  generated_title?: string;
  executive_summary?: string;
  quality_checklist?: string[];
};

export default function JobDetails() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.jobId as string;
  const safeJobId = toBigIntSafe(jobId);
  const addresses = getBrowserContractAddresses();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { tx, run, wallet } = useArcTransaction();
  const walletSession = useWalletSession();
  const [job, setJob] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deliverableURI, setDeliverableURI] = useState("");
  const [rejectCategory, setRejectCategory] = useState("");
  const [rejectReasonText, setRejectReasonText] = useState("");
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeApiLoading, setDisputeApiLoading] = useState(false);
  const [disputeApiError, setDisputeApiError] = useState<string | null>(null);
  const [disputeSyncNotice, setDisputeSyncNotice] = useState<{ tone: "success" | "warning"; message: string } | null>(null);
  const [gptLoading, setGptLoading] = useState(false);
  const [gptError, setGptError] = useState<string | null>(null);
  const [gptSuccess, setGptSuccess] = useState<string | null>(null);
  const [uriCopied, setUriCopied] = useState(false);
  const [savedDeliverableVisibility, setSavedDeliverableVisibility] = useState<"public" | "restricted" | null>(null);
  const [compactDeliverable, setCompactDeliverable] = useState<CompactDeliverable | null>(null);
  const [existingReview, setExistingReview] = useState<any>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [reviewPromptContext, setReviewPromptContext] = useState<ReviewContext | null>(null);
  const [regeneration, setRegeneration] = useState<{ attemptsUsed: number; maxAttempts: number; remainingAttempts: number } | null>(null);
  const [linkedDispute, setLinkedDispute] = useState<any>(null);
  const [autoRunFailed, setAutoRunFailed] = useState(false);
  const autoRunStarted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!safeJobId) throw new Error("Invalid job ID.");
      let nextJob: any = null;
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.job) nextJob = data.job;
      } catch (apiError) {
        logger.warn("ui.jobs.detail", "indexedRead:failed", { jobId, apiError }, "Indexed job fallback is unavailable");
      }
      if (addresses && publicClient) {
        try {
          nextJob = await readJobView(publicClient, addresses, safeJobId);
        } catch (onchainError) {
          if (!nextJob) throw onchainError;
          logger.warn("ui.jobs.detail", "onchainRead:fallback", { jobId, onchainError }, "Using indexed job after Arc Testnet read failed");
        }
      }
      if (!nextJob) throw new Error(addresses ? "Arc Testnet job not found." : "Arc Testnet contracts not configured.");
      let nextAgent: any = null;
      try {
        const response = await fetch(`/api/agents/${String(nextJob.agentId)}`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.agent) nextAgent = data.agent;
      } catch (apiError) {
        logger.warn("ui.jobs.detail", "agentIndexedRead:failed", { jobId, agentId: String(nextJob.agentId), apiError }, "Indexed agent fallback is unavailable");
      }
      if (addresses && publicClient) {
        try {
          nextAgent = await readAgentView(publicClient, addresses, BigInt(nextJob.agentId));
        } catch (onchainError) {
          if (!nextAgent) throw onchainError;
          logger.warn("ui.jobs.detail", "agentOnchainRead:fallback", { jobId, agentId: String(nextJob.agentId), onchainError }, "Using indexed agent after Arc Testnet read failed");
        }
      }
      if (!nextAgent) throw new Error("Assigned agent owner could not be loaded.");
      setJob(nextJob);
      setAgent(nextAgent);
      setDeliverableURI(nextJob.deliverableURI || "");

      try {
        const response = await fetch(`/api/jobs/${jobId}/deliverable`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data?.deliverable_uri) {
          setDeliverableURI(data.deliverable_uri);
          setSavedDeliverableVisibility(data.visibility === "public" ? "public" : "restricted");
        } else if (!nextJob.deliverableURI) {
          setSavedDeliverableVisibility(null);
        }
      } catch {
        // The live contract remains the source of truth if the cache lookup is unavailable.
      }
      if ([4, 6].includes(Number(nextJob.status))) {
        try {
          const response = await fetch(`/api/agents/${String(nextJob.agentId)}/reviews?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" });
          const data = await response.json();
          if (response.ok) setExistingReview(data.reviewForJob ?? null);
        } catch {
          setExistingReview(null);
        }
      } else {
        setExistingReview(null);
      }
      try {
        const response = await fetch(`/api/jobs/${jobId}/regenerations`, { cache: "no-store" });
        const data = await response.json();
        setRegeneration(response.ok && data.regeneration ? data.regeneration : null);
      } catch {
        setRegeneration(null);
      }
      if (Number(nextJob.status) === 6) {
        try {
          const response = await fetch("/api/disputes", { cache: "no-store" });
          const data = await response.json();
          const dispute = Array.isArray(data.disputes)
            ? data.disputes.find((item: any) => String(item.jobId) === String(nextJob.jobId))
            : null;
          setLinkedDispute(dispute ?? null);
        } catch {
          setLinkedDispute(null);
        }
      } else {
        setLinkedDispute(null);
      }
    } catch (loadError) {
      logger.warn("ui.jobs.detail", "load:failed", { jobId, contractsConfigured: Boolean(addresses), loadError }, "Job detail failed to load");
      setError(loadError instanceof Error ? loadError.message : "Failed to read Arc Testnet job.");
    } finally {
      setLoading(false);
    }
  }, [addresses, jobId, publicClient, safeJobId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const hash = deliverableHashFromURI(deliverableURI);
    if (!hash) {
      setCompactDeliverable(null);
      return;
    }
    let active = true;
    // Compact output must come through the secured deliverable API.
    fetch(`/api/deliverables/${hash}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active && data?.ok && data?.deliverable) {
          setCompactDeliverable({
            generated_title: data.deliverable.generated_title,
            executive_summary: data.deliverable.executive_summary,
            quality_checklist: data.deliverable.quality_checklist
          });
        }
      })
      .catch(() => {
        if (active) setCompactDeliverable(null);
      });
    return () => { active = false; };
  }, [deliverableURI, walletSession.verifiedWallet]);

  useEffect(() => {
    if (!job || Number(job.status) !== 4 || !wallet.address) return;
    if (wallet.address.toLowerCase() !== String(job.client).toLowerCase()) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("feedback") !== "approval") return;
    setReviewPromptContext("approval");
    url.searchParams.delete("feedback");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [job, wallet.address]);

  if (loading) return <div className="animate-pulse py-20 text-center text-[13px] text-slate-500">Loading Arc Testnet job...</div>;
  if (error || !job || !agent || !addresses) return <SetupRequired message={error || "Arc Testnet job not found."} />;

  const walletAddress = wallet.address?.toLowerCase() || "";
  const agentOwnerAddress = typeof agent.owner === "string" ? agent.owner : "";
  const agentOwnerNormalized = agentOwnerAddress.toLowerCase();
  const clientAddress = typeof job.client === "string" ? job.client : "";
  const evaluatorAddress = typeof job.evaluator === "string" ? job.evaluator : "";
  const isAgentOwner = Boolean(walletAddress && agentOwnerNormalized && walletAddress === agentOwnerNormalized);
  const isJobClient = Boolean(walletAddress && walletAddress === clientAddress.toLowerCase());
  const isReviewer = Boolean(walletAddress && (walletAddress === clientAddress.toLowerCase() || walletAddress === evaluatorAddress.toLowerCase()));
  const walletReady = wallet.isConnected && wallet.correctNetwork;
  const pending = tx.phase === "pending" || tx.phase === "confirming";
  const decoded = decodeBrowserJobURI(job.jobURI);
  const jobStatus = normalizeJobStatus(job.status) ?? Number(job.status);
  const hasDeliverableURI = Boolean(deliverableURI.trim());
  const deliverableHash = deliverableHashFromURI(deliverableURI);
  const deliverableVisibility = decoded?.deliverableVisibility === "public" ? "public" : "restricted";
  const jobClassification = resolveJobClassification({
    storedClassification: job.jobClassification,
    metadataClassification: decoded?.jobClassification ?? decoded?.jobMode,
    clientWallet: clientAddress,
    agentOwnerWallet: agentOwnerAddress
  });
  const isSelfUse = isSelfUseJob({ explicitClassification: jobClassification });
  const selfUseExplicit = jobClassification === "self_use" && Boolean(decoded?.jobClassification === "self_use" || decoded?.jobMode === "self_use");
  const countsTowardPublicRatings = shouldCountTowardPublicRatings({ explicitClassification: jobClassification });
  const ownerExecutionCopy = "Only the agent owner can start or submit work in the current contract version.";
  const linkedDisputeStatus = linkedDispute
    ? getDisputeStatus(linkedDispute, {
        hasEvidence: Boolean(linkedDispute.hasEvidence),
        hasAIReview: Boolean(linkedDispute.aiRecommendation)
      })
    : null;

  function walletReason() {
    if (!wallet.isConnected) return "Wallet not connected";
    if (!wallet.correctNetwork) return "Wrong network";
    return null;
  }

  function roleLabel() {
    if (jobStatus === 0) return "Client";
    if (jobStatus === 1) return "Agent owner";
    if (jobStatus === 2) return "Agent owner";
    if (jobStatus === 3) return "Client or evaluator";
    if (jobStatus === 6) return "Resolver or admin";
    return "No wallet action available";
  }

  const fundReason =
    walletReason() ||
    (jobStatus !== 0 ? "Job is not Open" : null) ||
    (walletAddress !== clientAddress.toLowerCase() ? "Connected wallet is not job client" : null) ||
    (pending ? "Transaction pending" : null);

  const markRunningReason =
    walletReason() ||
    (jobStatus !== 1 ? "Job is not Funded" : null) ||
    (!agentOwnerAddress ? "Agent owner could not be loaded" : null) ||
    (!isAgentOwner ? "Connected wallet is not agent owner" : null) ||
    (walletSession.signing ? "Wallet session verification pending" : null) ||
    (pending ? "Transaction pending" : null);

  const runGptReason =
    walletReason() ||
    (jobStatus !== 2 ? "Job is not Running" : null) ||
    (!agentOwnerAddress ? "Agent owner could not be loaded" : null) ||
    (!isAgentOwner ? ownerExecutionCopy : null) ||
    (!walletSession.matchesConnectedWallet ? "Verify wallet session before running AI" : null) ||
    (hasDeliverableURI ? "Deliverable already exists" : null) ||
    (gptLoading ? "AI run pending" : null);

  const regenerateReason =
    walletReason() ||
    (jobStatus !== 2 ? "Job is not Running" : null) ||
    (!agentOwnerAddress ? "Agent owner could not be loaded" : null) ||
    (!isAgentOwner ? ownerExecutionCopy : null) ||
    (!walletSession.matchesConnectedWallet ? "Verify wallet session before regenerating AI output" : null) ||
    (regeneration && regeneration.remainingAttempts <= 0 ? "Regeneration limit reached for this job" : null) ||
    (gptLoading ? "AI run pending" : null);

  const submitReason =
    walletReason() ||
    (jobStatus !== 2 ? "Job is not Running" : null) ||
    (!deliverableURI ? "Saved output is not ready" : null) ||
    (!agentOwnerAddress ? "Agent owner could not be loaded" : null) ||
    (!isAgentOwner ? "Connected wallet is not agent owner" : null) ||
    (pending ? "Transaction pending" : null);

  const approveReason =
    walletReason() ||
    (jobStatus !== 3 ? "Job is not Submitted" : null) ||
    (!isReviewer ? "Connected wallet is not client or evaluator" : null) ||
    (pending ? "Transaction pending" : null);

  const rejectReason =
    approveReason ||
    (!rejectReasonText.trim() ? "Rejection reason is required" : null) ||
    (rejectReasonText.trim().length < 20 ? "Rejection reason must be at least 20 characters" : null) ||
    (rejectReasonText.trim().length > 2000 ? "Rejection reason is too long" : null);
  const openDisputeReason = approveReason;

  const expireReason =
    walletReason() ||
    (![0, 1, 2].includes(jobStatus) ? "Job cannot be expired from this status" : null) ||
    (pending ? "Transaction pending" : null);

  async function transact(label: string, request: Parameters<typeof run>[1]) {
    const hash = await run(label, request);
    if (hash) await load();
    return hash;
  }

  async function fundEscrow() {
    const amount = BigInt(job.amount) + BigInt(job.clientBond);
    const approved = await run("Approve USDC", { address: addresses!.USDC, abi: erc20Abi, functionName: "approve", args: [addresses!.AgentJobEscrow, amount] });
    if (!approved) return;
    await transact("Fund escrow", { address: addresses!.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "fundJob", args: [safeJobId!] });
  }

  async function approveWork() {
    const hash = await transact("Approve and release", { address: addresses!.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "approveAndRelease", args: [safeJobId!] });
    if (hash && isJobClient && countsTowardPublicRatings) setReviewPromptContext("approval");
  }

  async function submitReview() {
    setReviewSubmitting(true);
    setReviewError(null);
    setReviewSuccess(null);
    try {
      const response = await fetch(`/api/agents/${String(agent.agentId)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, rating: reviewRating, reviewText, reviewContext: reviewPromptContext })
      });
      const data = await response.json();
      if (!response.ok || !data.review) throw new Error(data.error || "Agent review could not be saved.");
      setExistingReview(data.review);
      setReviewSuccess(reviewPromptContext === "dispute" ? "Your feedback has been submitted." : "Your review has been submitted.");
      setReviewPromptContext(null);
    } catch (reviewSubmitError) {
      setReviewError(reviewSubmitError instanceof Error ? reviewSubmitError.message : "Agent review could not be saved.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleConfirmDispute() {
    setDisputeApiLoading(true);
    setDisputeApiError(null);
    setDisputeSyncNotice(null);
    try {
      const response = await fetch('/api/disputes/metadata', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonSafe({
          jobId: jobId.toString(),
          agentId: agent.agentId ? agent.agentId.toString() : null,
          clientWallet: job.client,
          evaluatorWallet: job.evaluator,
          category: rejectCategory,
          reason: rejectReasonText,
          deliverableURI,
          chainId: arcTestnet.id
        })
      });
      const data = await response.json();
      if (!response.ok || !data.reasonURI) {
        const message = [data.error, data.details].filter(Boolean).join(" ");
        setDisputeApiError(message || "Failed to save dispute metadata.");
        return;
      }
      
      const hash = await run("Reject to dispute", { 
        address: addresses!.AgentJobEscrow, 
        abi: agentJobEscrowAbi, 
        functionName: "rejectToDispute", 
        args: [safeJobId!, data.reasonURI] 
      });
      
      if (hash) {
        try {
          const syncResponse = await fetch("/api/disputes/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: String(job.jobId), txHash: hash })
          });
          const syncData = await syncResponse.json();
          if (!syncResponse.ok || !syncData.ok) {
            const details = [syncData.error, syncData.details].filter(Boolean).join(" ");
            setDisputeSyncNotice({
              tone: "warning",
              message: `Dispute opened onchain, but indexed data needs attention. ${details || "Run npm run arc:supabase:sync to recover the dispute index."}`
            });
          } else {
            setDisputeSyncNotice({
              tone: "success",
              message: `Dispute #${String(syncData.disputeId)} opened onchain and indexed.`
            });
          }
        } catch (syncError) {
          setDisputeSyncNotice({
            tone: "warning",
            message: `Dispute opened onchain, but indexed data needs attention. ${syncError instanceof Error ? syncError.message : "Run npm run arc:supabase:sync to recover the dispute index."}`
          });
        }
        setShowDisputeModal(false);
        setDisputeApiError(null);
        if (isJobClient && countsTowardPublicRatings) setReviewPromptContext("dispute");
        await load();
        router.refresh();
      }
    } catch (err) {
      setDisputeApiError(err instanceof Error ? err.message : "Failed to save dispute metadata.");
    } finally {
      setDisputeApiLoading(false);
    }
  }

  async function runGptAgent(forceRegenerate = false) {
    setGptLoading(true);
    setGptError(null);
    setGptSuccess(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonSafe({
          agentName: agent.name,
          agentCategory: agent.category,
          jobTitle: decoded?.title || `Job ${jobId}`,
          jobDescription: decoded?.description || job.jobURI,
          deliverableType: detectDeliverableType(decoded?.title || `Job ${jobId}`, decoded?.description || job.jobURI),
          chainId: arcTestnet.id,
          jobId: String(job.jobId),
          agentId: String(agent.agentId),
          createdByWallet: wallet.address || null,
          visibility: deliverableVisibility,
          clientWallet: job.client,
          agentOwnerWallet: agent.owner,
          evaluatorWallet: job.evaluator,
          forceRegenerate
        })
      });
      const data = await response.json();
      const nextURI = data.deliverable?.deliverableURI || data.deliverableURI;
      if (!response.ok || !nextURI) throw new Error(data.error || "AI agent run failed.");
      setDeliverableURI(nextURI);
      if (data.deliverable?.visibility === "public" || data.deliverable?.visibility === "restricted") {
        setSavedDeliverableVisibility(data.deliverable.visibility);
      }
      if (data.regeneration) setRegeneration(data.regeneration);
      setGptSuccess(data.reused ? "Existing sealed output is ready." : data.message || "Output ready.");
      setAutoRunFailed(false);
      return nextURI as string;
    } catch (runError) {
      setGptError(runError instanceof Error ? runError.message : "AI agent run failed.");
      return null;
    } finally {
      setGptLoading(false);
    }
  }

  async function waitForRunningState() {
    if (!publicClient || !addresses || !safeJobId) throw new Error("Arc Testnet job state is unavailable.");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const nextJob = await readJobView(publicClient, addresses, safeJobId);
      if (normalizeJobStatus(nextJob.status) === JOB_STATUS.RUNNING) {
        setJob(nextJob);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 900));
    }
    throw new Error("Start Work confirmed, but Arc Testnet has not reported the Running state yet. Retry AI generation from recovery controls.");
  }

  async function startWorkAndGenerate() {
    if (autoRunStarted.current) return;
    autoRunStarted.current = true;
    setAutoRunFailed(false);
    setGptError(null);
    setGptSuccess(null);
    try {
      if (!walletSession.matchesConnectedWallet) {
        await walletSession.signIn();
      }
      const hash = await run("Start work", { address: addresses!.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "markRunning", args: [safeJobId!] });
      if (!hash) return;
      await waitForRunningState();
      const generatedURI = await runGptAgent(false);
      if (!generatedURI) setAutoRunFailed(true);
      await load();
    } catch (startError) {
      setAutoRunFailed(true);
      setGptError(startError instanceof Error ? startError.message : "AI generation could not start after the transaction confirmed.");
    } finally {
      autoRunStarted.current = false;
    }
  }

  async function copyDeliverableURI() {
    if (!deliverableURI) return;
    try {
      await navigator.clipboard.writeText(deliverableURI);
      setUriCopied(true);
      window.setTimeout(() => setUriCopied(false), 1600);
    } catch {
      setUriCopied(false);
    }
  }

  const agentDisplayId = formatAgentDisplayId(agent.name, agent.agentId);
  const effectiveDeliverableVisibility = savedDeliverableVisibility ?? deliverableVisibility;
  const canOpenSavedOutput =
    jobStatus === 2
      ? isAgentOwner && walletSession.matchesConnectedWallet
      : jobStatus === 3
        ? effectiveDeliverableVisibility === "public" || walletSession.matchesConnectedWallet && (isAgentOwner || isReviewer)
        : jobStatus === 4
          ? effectiveDeliverableVisibility === "public" || walletSession.matchesConnectedWallet && (isAgentOwner || isReviewer)
          : jobStatus === 6
            ? effectiveDeliverableVisibility === "public" || walletSession.matchesConnectedWallet && (isAgentOwner || isReviewer)
            : false;
  const needsVerifiedSession = Boolean(
    walletReady &&
    !walletSession.matchesConnectedWallet &&
    (
      jobStatus === 2 && isAgentOwner ||
      [3, 4, 6].includes(jobStatus) && effectiveDeliverableVisibility !== "public" && (isAgentOwner || isReviewer)
    )
  );
  const deliverableViewLabel =
    jobStatus === 2
      ? isAgentOwner ? walletSession.matchesConnectedWallet ? selfUseExplicit ? "View Self-use Output" : "View Sealed Preview" : "Verify Wallet Session" : isReviewer ? "Waiting For Submission" : "Locked until approval"
      : jobStatus === 3
        ? isAgentOwner ? walletSession.matchesConnectedWallet ? selfUseExplicit ? "View Self-use Output" : "View Sealed Preview" : "Verify Wallet Session" : isReviewer ? walletSession.matchesConnectedWallet ? "View Preview" : "Verify Wallet Session" : effectiveDeliverableVisibility === "public" ? "View Preview" : "Locked until approval"
        : jobStatus === 4
          ? "View Full Report"
          : jobStatus === 6
            ? isAgentOwner || isReviewer || effectiveDeliverableVisibility === "public" ? "View Preview" : "Locked until approval"
            : "Locked until approval";
  const deliverableStatusLabel = jobStatus === 4
    ? "Approved"
    : jobStatus === 6
      ? "In Dispute"
      : jobStatus === 3
        ? "Pending Approval"
        : "Sealed Preview";

  return (
    <div className="flex flex-col gap-10 pb-12 animate-fadeInUp">
      <div className="flex flex-col gap-6 border-b border-borderDark/60 pb-8 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-4">
            <h1 className="lux-heading text-[36px] tracking-[-0.03em]">Job {String(job.jobId)}</h1>
            <JobStatusBadge statusLabel={job.statusLabel} />
          </div>
          <p className="lux-copy max-w-2xl text-[15px]">Arc Testnet USDC escrow for {agent.name}.</p>
        </div>
        <Button variant="ghost" onClick={() => router.back()}>Back</Button>
      </div>

      <TxStatus tx={tx} />
      <WalletFundsNotice />
      {disputeSyncNotice && (
        <div className={`rounded-xl border p-4 text-[13px] leading-6 ${
          disputeSyncNotice.tone === "success"
            ? "border-success/30 bg-success/5 text-success"
            : "border-warning/30 bg-warning/5 text-warning"
        }`}>
          {disputeSyncNotice.message}
        </div>
      )}
      {gptError && <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] text-danger">{gptError}</div>}
      {gptSuccess && <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-[13px] leading-5 text-success">{gptSuccess}</div>}
      {reviewSuccess && <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-[13px] leading-5 text-success">{reviewSuccess}</div>}
      {linkedDisputeStatus && (
        <div className={`rounded-xl border p-4 text-[13px] leading-6 ${linkedDispute?.resolved ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/5 text-warning"}`}>
          Dispute status: {linkedDisputeStatus}.
          {linkedDispute?.resolved && " The onchain outcome is final."}
        </div>
      )}
      {isSelfUse && (
        <div className="rounded-xl border border-warning/25 bg-warning/[0.05] p-5">
          <div className="text-label text-warning">Self-use / Test Run</div>
          <div className="mt-2 text-[13px] leading-6 text-slate-400">
            Self-use job detected. This run will not count toward public marketplace ratings.
            {!selfUseExplicit && " Complete the normal approval flow to unlock the sealed result."}
          </div>
        </div>
      )}
      {!isSelfUse && (
        <div className="rounded-xl border border-success/20 bg-success/[0.035] p-4 text-[12px] leading-5 text-slate-400">
          Marketplace job. Public rating eligibility follows the explicit saved classification, independent of wallet reuse.
        </div>
      )}
      {jobStatus === 1 && (
        <div className="rounded-xl border border-info/20 bg-info/5 p-5">
          <div className="text-label text-info">Waiting for Agent Runner</div>
          <div className="mt-2 text-[13px] leading-6 text-slate-400">
            This job is funded. The agent owner must start work because the current ArcPilot contracts require the registered agent owner to run and submit deliverables.
          </div>
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[1fr_390px]">
        <div className="flex flex-col gap-8">
          <Section title="Escrow Lifecycle">
            <Card className="border-borderDark/80 bg-black/20 p-8 shadow-depth-lg">
              <JobTimeline status={Number(job.status)} />
            </Card>
          </Section>
          <Section title="Agent Output">
            <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
              {hasDeliverableURI ? (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${jobStatus === 4 ? "border-success/30 bg-success/10 text-success" : jobStatus === 6 ? "border-danger/30 bg-danger/10 text-danger" : "border-accent/30 bg-accent/10 text-accent"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${jobStatus === 4 ? "bg-success" : jobStatus === 6 ? "bg-danger" : "bg-accent animate-pulse"}`}></span>
                        {deliverableStatusLabel}
                      </div>
                    </div>
                  </div>
                  <div className="bg-black/40 border border-borderDark rounded-xl p-4 shadow-depth-inset">
                    {compactDeliverable?.generated_title && <div className="mb-2 font-heading text-[18px] tracking-[-0.01em] text-white">{compactDeliverable.generated_title}</div>}
                    {compactDeliverable?.executive_summary && <div className="mb-4 line-clamp-2 text-[13px] leading-6 text-slate-400">{compactDeliverable.executive_summary}</div>}
                    {compactDeliverable?.quality_checklist && compactDeliverable.quality_checklist.length > 0 && (
                      <div className="mb-4 grid gap-2 border-t border-borderDark pt-3">
                        {compactDeliverable.quality_checklist.slice(0, 3).map((item, index) => (
                          <div key={`${item}-${index}`} className="text-[12px] leading-5 text-slate-500">Quality {index + 1}: {item}</div>
                        ))}
                      </div>
                    )}
                    <div className="text-[13px] leading-6 text-slate-400">Saved output generated. Its protected URI is ready for the agent-owner submission transaction.</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {canOpenSavedOutput
                      ? <DeliverableViewer deliverableURI={deliverableURI} label={deliverableViewLabel} />
                      : needsVerifiedSession
                        ? <Button variant="secondary" onClick={() => walletSession.signIn().catch(() => undefined)} disabled={walletSession.signing}>{walletSession.signing ? "Waiting For Signature..." : "Verify Wallet Session"}</Button>
                        : <Button variant="secondary" disabled>{deliverableViewLabel}</Button>}
                  </div>
                  {(isAgentOwner || jobStatus >= 3) && (
                    <details className="rounded-xl border border-borderDark bg-black/20 p-4 text-[12px] text-slate-500">
                      <summary className="cursor-pointer select-none text-label text-slate-400">Developer Details</summary>
                      {deliverableHash && <div className="mono-value mt-4 break-all leading-5 text-slate-400">Hash {deliverableHash}</div>}
                      <div className="mono-value mt-3 break-all leading-5 text-slate-400">URI {deliverableURI}</div>
                      <Button className="mt-4" variant="secondary" onClick={copyDeliverableURI}>Copy URI</Button>
                      {uriCopied && <span className="ml-3 text-success">URI copied</span>}
                      {jobStatus === 2 && isAgentOwner && (
                        <div className="mt-4 border-t border-borderDark pt-4">
                          <div className="leading-5">Recovery only. Generate a replacement output only when the saved result needs another pass.</div>
                          <Button className="mt-3" variant="secondary" onClick={() => runGptAgent(true)} disabled={Boolean(regenerateReason)} title={regenerateReason || undefined}>
                            {gptLoading ? "Regenerating..." : "Retry AI Generation"}
                          </Button>
                        </div>
                      )}
                    </details>
                  )}
                  {jobStatus === 2 && isReviewer && !isAgentOwner && <div className="text-[12px] leading-5 text-slate-500">The agent has generated output but has not submitted it for review yet.</div>}
                  {jobStatus === 2 && isAgentOwner && !selfUseExplicit && <div className="text-[12px] leading-5 text-warning">Saved output generated. The full result stays sealed until escrow approval.</div>}
                  {jobStatus === 2 && isAgentOwner && regeneration && (
                    <div className="text-[12px] leading-5 text-slate-500">
                      Regeneration allowance: {regeneration.remainingAttempts} of {regeneration.maxAttempts} remaining.
                      {regeneration.remainingAttempts === 0 && " Regeneration limit reached for this job."}
                    </div>
                  )}
                  {jobStatus === 2 && !isReviewer && !isAgentOwner && <div className="text-[12px] leading-5 text-slate-500">This saved output is restricted until the agent submits it onchain.</div>}
                  {jobStatus === 2 && isAgentOwner && submitReason && <div className="text-[12px] leading-5 text-slate-500">Submit: {submitReason}.</div>}
                  {walletSession.error && <div className="text-[12px] leading-5 text-danger">{walletSession.error}</div>}
                  {jobStatus === 4 && <div className="text-[12px] leading-5 text-slate-500">This job is completed. To generate a new deliverable, create a new job.</div>}
                </div>
              ) : (
                jobStatus === 1 ? (
                  <div className="text-[13px] leading-6 text-slate-500">
                    Waiting for agent owner to start work.
                  </div>
                ) : jobStatus === 2 && isAgentOwner ? (
                  <>
                    <div className="text-[13px] leading-6 text-slate-500">
                      {gptLoading ? "Generating sealed output..." : "ArcPilot has not found a saved deliverable yet. Automatic generation runs immediately after Start Work confirms."}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {!walletSession.matchesConnectedWallet && walletReady && (
                        <Button variant="secondary" onClick={() => walletSession.signIn().catch(() => undefined)} disabled={walletSession.signing}>
                          {walletSession.signing ? "Waiting For Signature..." : "Verify Wallet Session"}
                        </Button>
                      )}
                    </div>
                    <details className="mt-4 rounded-xl border border-borderDark bg-black/20 p-4">
                      <summary className="cursor-pointer select-none text-label text-slate-400">{autoRunFailed ? "AI Generation Needs Attention" : "Recovery Controls"}</summary>
                      <div className="mt-3 text-[12px] leading-5 text-slate-500">Use this only if automatic generation did not complete after Start Work.</div>
                      <Button className="mt-4" variant="secondary" onClick={() => void runGptAgent(false)} disabled={Boolean(runGptReason)} title={runGptReason || undefined}>{gptLoading ? "Generating..." : "Retry AI Generation"}</Button>
                      {runGptReason && <div className="mt-3 text-[12px] leading-5 text-slate-500">Retry: {runGptReason}.</div>}
                    </details>
                    {walletSession.error && <div className="mt-3 text-[12px] leading-5 text-danger">{walletSession.error}</div>}
                  </>
                ) : jobStatus === 2 ? (
                  <div className="text-[13px] leading-6 text-slate-500">
                    Agent work in progress. {ownerExecutionCopy}
                  </div>
                ) : (
                  <div className="text-[13px] leading-6 text-slate-500">
                    {jobStatus === 0 ? "Fund escrow to begin the agent workflow." : "No agent output is available for this job."}
                  </div>
                )
              )}
            </Card>
          </Section>
          <Section title="Review And Dispute">
            <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
              {jobStatus < 3 ? (
                <div className="text-[13px] leading-6 text-slate-500">
                  Review is available after the agent submits a deliverable.
                </div>
              ) : jobStatus > 3 ? (
                <div className="text-[13px] leading-6 text-slate-500">
                  This job is no longer in the Submitted state.
                </div>
              ) : !isReviewer ? (
                <div className="text-[13px] leading-6 text-slate-500">
                  Only the client or evaluator can review this job.
                </div>
              ) : (
                <>
                  <div className="text-[13px] leading-6 text-slate-500">
                    Review the protected deliverable preview, then approve the completed work or open a dispute with a clear rejection reason.
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button variant="success" onClick={approveWork} disabled={Boolean(approveReason)} title={approveReason || undefined}>Approve And Release</Button>
                    <Button variant="danger" onClick={() => { setDisputeApiError(null); setShowDisputeModal(true); }} disabled={Boolean(openDisputeReason)} title={openDisputeReason || undefined}>Reject To Dispute</Button>
                  </div>
                  {approveReason && <div className="mt-3 text-[12px] leading-5 text-slate-500">Review actions: {approveReason}.</div>}
                </>
              )}
            </Card>
          </Section>
          {[4, 6].includes(jobStatus) && isJobClient && (
            <Section title="Rate This Agent">
              <Card className="border-warning/20 bg-warning/[0.035] p-7 shadow-depth-md">
                {existingReview ? (
                  <div>
                    <div className="text-label text-success">Your review has been submitted.</div>
                    <div className="mt-3 text-warning">{"★".repeat(Number(existingReview.rating || 0))}</div>
                    {existingReview.review_text && <div className="mt-3 text-[13px] leading-6 text-slate-300">{existingReview.review_text}</div>}
                  </div>
                ) : isSelfUse ? (
                  <div className="text-[13px] leading-6 text-slate-400">Self-use jobs remain auditable but do not count toward public agent ratings.</div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-label text-warning">{jobStatus === 6 ? "Client Feedback" : "Client Review"}</div>
                      <div className="mt-2 text-[13px] leading-6 text-slate-400">Sharing a rating is optional and helps future clients choose the right agent.</div>
                    </div>
                    <Button variant="secondary" onClick={() => { setReviewError(null); setReviewPromptContext(jobStatus === 6 ? "dispute" : "approval"); }}>
                      {jobStatus === 6 ? "Share Feedback" : "Rate Agent"}
                    </Button>
                  </div>
                )}
              </Card>
            </Section>
          )}
        </div>
        <div className="flex flex-col gap-8">
          <Section title="Escrow Configuration">
            <Card className="border-borderDark/60 bg-black/20 p-6 shadow-depth-md">
              <div className="text-label">Locked Reward</div>
              <div className="mt-2 font-heading text-[30px] text-success">{formatUSDC(job.amount, { compact: true })}</div>
              <div className="mt-5 border-t border-borderDark pt-4 text-[12px] leading-6 text-slate-500">Client bond: <span className="mono-value text-slate-300">{formatUSDC(job.clientBond, { compact: true })}</span></div>
              <div className="text-[12px] leading-6 text-slate-500">Client: <span className="mono-value text-slate-300">{shortenAddress(job.client)}</span></div>
              <div className="text-[12px] leading-6 text-slate-500">Agent: <span className="mono-value text-slate-300">{agentDisplayId}</span></div>
            </Card>
          </Section>
          <Section title="Role Check">
            <Card className="border-borderDark/60 bg-black/20 p-5 shadow-depth-md">
              <div className="grid gap-3">
                <div className="flex justify-between gap-4 border-b border-borderDark pb-3"><span className="text-label">Agent Owner</span><span className="mono-value text-[12px] text-slate-300">{agentOwnerAddress ? shortenAddress(agentOwnerAddress) : "Not loaded"}</span></div>
                <div className="flex justify-between gap-4 border-b border-borderDark pb-3"><span className="text-label">Connected Wallet</span><span className="mono-value text-[12px] text-slate-300">{wallet.address ? shortenAddress(wallet.address) : "Disconnected"}</span></div>
                <div className="flex justify-between gap-4"><span className="text-label">Required Role</span><span className="text-right text-[12px] text-slate-300">{roleLabel()}</span></div>
              </div>
            </Card>
          </Section>
          <Section title="Job Execution">
            <Card className="space-y-3 border-borderDark/60 bg-black/20 p-5 shadow-depth-md">
              {jobStatus === 0 && (
                <>
                  <Button className="w-full" onClick={fundEscrow} disabled={Boolean(fundReason)} title={fundReason || undefined}>Fund Escrow</Button>
                  <div className="text-[12px] leading-5 text-slate-500">{fundReason ? `Fund: ${fundReason}.` : "Approves ERC-20 USDC and funds the escrow from the client wallet."}</div>
                </>
              )}
              {jobStatus === 1 && isAgentOwner && (
                <>
                  <Button className="w-full" variant="secondary" onClick={() => void startWorkAndGenerate()} disabled={Boolean(markRunningReason)} title={markRunningReason || undefined}>
                    {walletSession.signing ? "Waiting For Signature..." : pending ? "Confirming Start Work..." : "Start Work & Generate Output"}
                  </Button>
                  <div className="text-[12px] leading-5 text-slate-500">
                    {markRunningReason ? `Start work: ${markRunningReason}.` : "Start work to generate a sealed output. The result stays locked until escrow review."}
                  </div>
                </>
              )}
              {jobStatus === 2 && isAgentOwner && !hasDeliverableURI && (
                <>
                  <Button className="w-full" variant="secondary" disabled>{gptLoading ? "Generating Sealed Output..." : autoRunFailed ? "AI Generation Needs Retry" : "Waiting For Saved Output"}</Button>
                  <div className="text-[12px] leading-5 text-slate-500">ArcPilot automatically generates offchain output after Start Work. Recovery controls are available in Agent Output.</div>
                </>
              )}
              {jobStatus === 2 && isAgentOwner && hasDeliverableURI && (
                <>
                  <Button className="w-full" onClick={() => transact("Submit deliverable", { address: addresses.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "submitDeliverable", args: [safeJobId!, deliverableURI] })} disabled={Boolean(submitReason)} title={submitReason || undefined}>Submit Deliverable</Button>
                  <div className="text-[12px] leading-5 text-slate-500">{submitReason ? `Submit: ${submitReason}.` : "Saved output is ready for the required agent-owner submission transaction."}</div>
                </>
              )}
              {jobStatus === 3 && (
                <>
                  <Button className="w-full" variant="secondary" disabled>Waiting For Client Review</Button>
                  <div className="text-[12px] leading-5 text-slate-500">The deliverable is submitted onchain. The client or evaluator can approve or open a dispute.</div>
                </>
              )}
              {jobStatus === 6 && (
                <Button className="w-full" variant="secondary" onClick={() => router.push(linkedDispute ? `/disputes/${String(linkedDispute.disputeId)}` : "/disputes")}>{linkedDispute ? "Open Dispute" : "View Disputes"}</Button>
              )}
              {jobStatus === 1 && !isAgentOwner && (
                <>
                  <Button className="w-full" variant="secondary" disabled>Waiting For Agent Runner</Button>
                  <div className="text-[12px] leading-5 text-slate-500">{isJobClient ? "Waiting for agent owner to start work." : ownerExecutionCopy}</div>
                </>
              )}
              {[0, 1, 2].includes(jobStatus) && (
                <>
                  <Button className="w-full" variant="secondary" onClick={() => transact("Expire and refund", { address: addresses.AgentJobEscrow, abi: agentJobEscrowAbi, functionName: "expireAndRefund", args: [safeJobId!] })} disabled={Boolean(expireReason)} title={expireReason || undefined}>Expire / Refund</Button>
                  {expireReason && <div className="text-[12px] leading-5 text-slate-500">Expire: {expireReason}.</div>}
                </>
              )}
              <div className="text-[12px] leading-5 text-slate-500">You need Arc Testnet USDC for gas and payments.</div>
            </Card>
          </Section>
        </div>
      </div>
      
      <DisputeConfirmModal
        isOpen={showDisputeModal}
        onClose={() => { setShowDisputeModal(false); setDisputeApiError(null); }}
        onConfirm={handleConfirmDispute}
        jobId={jobId}
        agentDisplayId={agentDisplayId}
        lockedReward={formatUSDC(job.amount, { compact: true })}
        clientBond={formatUSDC(job.clientBond, { compact: true })}
        category={rejectCategory}
        reason={rejectReasonText}
        onCategoryChange={setRejectCategory}
        onReasonChange={setRejectReasonText}
        confirmDisabledReason={rejectReason}
        loading={disputeApiLoading || pending}
        error={disputeApiError}
      />
      <JobFeedbackModal
        isOpen={Boolean(reviewPromptContext)}
        context={reviewPromptContext || "approval"}
        rating={reviewRating}
        reviewText={reviewText}
        submitting={reviewSubmitting}
        sessionReady={walletSession.matchesConnectedWallet}
        sessionSigning={walletSession.signing}
        error={reviewError}
        onRatingChange={setReviewRating}
        onReviewTextChange={setReviewText}
        onSubmit={submitReview}
        onSkip={() => { setReviewPromptContext(null); setReviewError(null); }}
        onVerifySession={() => walletSession.signIn().catch(() => undefined)}
      />
    </div>
  );
}
