"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { agentJobEscrowAbi } from "../../../lib/contracts/browser-abis";
import { getBrowserContractAddresses } from "../../../lib/contracts/browser-addresses";
import { useArcTransaction } from "../../../lib/contracts/hooks";
import { useWalletSession } from "../../../lib/auth/use-wallet-session";
import { cleanChecklistItem, parseContentSections, stripMarkdown, type ContentSection } from "../../../lib/format/deliverable";
import { TxStatus } from "../../../components/shared/TxStatus";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { logger } from "../../../lib/logger";

type AccessMode = "full" | "preview" | "locked";
type DeliverableMode = "draft" | "preview" | "full" | "locked" | "disputed";

type ApiDeliverable = {
  deliverable_hash: string;
  deliverable_uri: string;
  chain_id: number | null;
  job_id: string | number | null;
  agent_id: string | number | null;
  agent_name: string;
  agent_category: string;
  job_title: string;
  job_description?: string;
  deliverable_type: string;
  visibility: "public" | "restricted";
  generated_title?: string;
  executive_summary?: string;
  key_findings?: string[];
  recommendations?: string[];
  generated_content?: string;
  quality_checklist?: string[];
  created_at: string;
};

type DeliverableResponse = {
  ok: boolean;
  access?: AccessMode;
  mode?: DeliverableMode;
  source?: "supabase" | "local";
  jobStatus?: string;
  isSubmittedOnchain?: boolean;
  isSelfUse?: boolean;
  selfUseExplicit?: boolean;
  verifiedWallet?: boolean;
  viewerRole?: string;
  message?: string;
  deliverable?: ApiDeliverable;
  error?: string;
};

function compact(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function shorten(value: string) {
  return value.length <= 22 ? value : `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function ReportSection({ section }: { section: ContentSection }) {
  if (section.type === "heading") {
    return <h2 className="pt-4 font-heading text-[22px] font-[520] tracking-[-0.02em] text-white first:pt-0">{section.text}</h2>;
  }
  if (section.type === "bullet-list") {
    return (
      <ul className="flex flex-col gap-3">
        {(section.items || []).map((item, index) => (
          <li key={`${item}-${index}`} className="flex items-start gap-3 text-[15px] leading-7 text-slate-300">
            <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="text-[15px] leading-7 text-slate-300">{section.text}</p>;
}

function ReviewList({ items, empty }: { items: string[]; empty: string }) {
  return items.length > 0 ? (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex gap-3 rounded-xl border border-borderDark/70 bg-black/25 p-4 text-[14px] leading-6 text-slate-300">
          <span className="mono-value text-accent">0{index + 1}</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  ) : <div className="text-[13px] leading-6 text-slate-500">{empty}</div>;
}

export default function DeliverablePage() {
  const params = useParams();
  const router = useRouter();
  const addresses = getBrowserContractAddresses();
  const { tx, run, wallet } = useArcTransaction();
  const walletSession = useWalletSession();
  const hash = String(params?.hash || "");
  const validHash = /^0x[a-fA-F0-9]{64}$/.test(hash);
  const [response, setResponse] = useState<DeliverableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!validHash) throw new Error("Invalid deliverable hash.");
      // Do not bypass deliverable API access control. The API reads the verified httpOnly wallet session.
      const apiResponse = await fetch(`/api/deliverables/${hash}`, { cache: "no-store" });
      const data = await apiResponse.json() as DeliverableResponse;
      if (!apiResponse.ok || !data.ok || !data.deliverable) {
        throw new Error(data.error || "Unable to load deliverable.");
      }
      setResponse(data);
    } catch (loadError) {
      logger.warn("ui.deliverables.detail", "load:failed", { hash, loadError }, "Deliverable detail failed to load");
      setError(loadError instanceof Error ? loadError.message : "Unable to load deliverable.");
    } finally {
      setLoading(false);
    }
  }, [hash, validHash, walletSession.verifiedWallet]);

  useEffect(() => { load(); }, [load]);

  const deliverable = response?.deliverable;
  const mode = response?.mode || response?.access || "locked";
  const sections = useMemo(
    () => deliverable?.generated_content ? parseContentSections(deliverable.generated_content) : [],
    [deliverable?.generated_content]
  );
  const checklist = useMemo(
    () => (deliverable?.quality_checklist || []).map(cleanChecklistItem).filter(Boolean),
    [deliverable?.quality_checklist]
  );
  const canApprove = response?.jobStatus === "Submitted" && (response.viewerRole === "client" || response.viewerRole === "evaluator");

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied("Copy unavailable");
    }
  }

  async function approveAndRelease() {
    if (!deliverable?.job_id || !addresses) return;
    const txHash = await run("Approve and release", {
      address: addresses.AgentJobEscrow,
      abi: agentJobEscrowAbi,
      functionName: "approveAndRelease",
      args: [BigInt(deliverable.job_id)]
    });
    if (txHash) router.push(`/jobs/${deliverable.job_id}?feedback=approval`);
  }

  if (loading) {
    return <div className="py-24 text-center text-[14px] text-slate-500">Loading deliverable report...</div>;
  }
  if (error || !deliverable) {
    return <Card className="border-danger/30 bg-danger/5 p-8 text-[15px] leading-7 text-danger">{error || "Deliverable unavailable."}</Card>;
  }

  const draft = mode === "draft";
  const disputed = mode === "disputed";
  const preview = response?.access === "preview" || disputed;
  const full = response?.access === "full";
  const locked = response?.access === "locked";
  const title = stripMarkdown(deliverable.generated_title || deliverable.job_title || "ArcPilot Deliverable");
  const reportLabel = draft
    ? "Sealed Preview"
    : disputed
      ? "In Dispute"
      : preview
        ? "Pending Approval"
        : full
          ? "Approved"
          : "Locked until approval";

  return (
    <div className="flex flex-col gap-6 pb-12 animate-fadeInUp">
      <section className="relative overflow-hidden rounded-[24px] border border-borderDark/80 bg-[radial-gradient(ellipse_at_top_right,rgba(147,197,253,0.06),transparent_52%),linear-gradient(180deg,rgba(10,15,29,0.76),rgba(6,9,20,0.9))] p-8 shadow-depth-lg backdrop-blur-2xl">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-accent">
                {reportLabel}
              </span>
            </div>
            <h1 className="lux-heading max-w-4xl text-[34px] tracking-[-0.03em] sm:text-[42px]">{title}</h1>
            <p className="mt-4 max-w-3xl text-[14px] leading-7 text-slate-400">
              {full && response?.jobStatus === "Completed"
                ? "Full report unlocked after escrow release. Approved and settled on Arc Testnet."
                : response?.message}
            </p>
          </div>
          <Button variant="secondary" onClick={() => deliverable.job_id ? router.push(`/jobs/${deliverable.job_id}`) : router.back()}>Back To Job</Button>
        </div>
      </section>

      <TxStatus tx={tx} />
      {process.env.NODE_ENV !== "production" && (
        <div className="mono-value rounded-lg border border-borderDark bg-black/20 px-4 py-3 text-[11px] leading-5 text-slate-500">
          Access: {response?.access || "locked"} / Mode: {mode} / Viewer role: {response?.viewerRole || "public"} / Verified wallet: {response?.verifiedWallet ? "yes" : "no"}
        </div>
      )}

      {locked ? (
        <Card className="border-warning/25 bg-warning/[0.04] p-8 shadow-depth-md">
          <div className="text-label text-warning">Locked until approval</div>
          <h2 className="mt-3 font-heading text-[26px] tracking-[-0.02em] text-white">{draft ? "Sealed output" : "Connect an authorized wallet to preview this deliverable."}</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-7 text-slate-400">
            {draft
              ? "The agent has generated output, but it has not been submitted for client review yet."
              : response?.message || "This deliverable belongs to a restricted escrow job. Connect as the client, evaluator, or agent owner to preview it."}
          </p>
          {wallet.isConnected && wallet.correctNetwork && !walletSession.matchesConnectedWallet && (
            <Button className="mt-5" onClick={() => walletSession.signIn().catch(() => undefined)} disabled={walletSession.signing}>
              {walletSession.signing ? "Waiting For Signature..." : "Verify Wallet Session"}
            </Button>
          )}
          {walletSession.error && <div className="mt-4 text-[13px] leading-6 text-danger">{walletSession.error}</div>}
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-6">
            <Card className="border-borderDark/80 bg-black/20 p-8 shadow-depth-md">
              <div className="text-label">Executive Summary</div>
              <p className="mt-4 text-[15px] leading-7 text-slate-300">{deliverable.executive_summary || "A saved ArcPilot deliverable is ready for escrow review."}</p>
            </Card>

            <Card className="border-borderDark/80 bg-black/20 p-8 shadow-depth-md">
              <div className="text-label">Key Findings</div>
              <div className="mt-4"><ReviewList items={deliverable.key_findings || []} empty="Key findings are included in the full saved report." /></div>
            </Card>

            {preview ? (
              <Card className="relative overflow-hidden border-warning/25 bg-warning/[0.035] p-8 shadow-depth-lg">
                <div className="absolute inset-x-8 bottom-0 h-24 rounded-t-2xl bg-white/[0.025] blur-[8px]" />
                <div className="relative">
                  <div className="text-label text-warning">{response?.jobStatus === "Disputed" ? "Deliverable Under Dispute" : "Protected Result"}</div>
                  <h2 className="mt-3 font-heading text-[28px] tracking-[-0.02em] text-white">{response?.jobStatus === "Disputed" ? "Full report locked during dispute review" : "Full report locked until approval"}</h2>
                  <p className="mt-3 max-w-2xl text-[14px] leading-7 text-slate-400">
                    {response?.jobStatus === "Disputed"
                      ? "This deliverable is currently under dispute. Full report access depends on the final resolution."
                      : response?.viewerRole === "agent_owner" && !response?.selfUseExplicit
                        ? "Output is sealed until settlement to protect marketplace integrity. Submit the deliverable URI and complete escrow approval to unlock the full result."
                        : "Full result unlocks after escrow approval. Approve this task to release payment and unlock the complete report."}
                  </p>
                </div>
              </Card>
            ) : (
              <>
                <Card className="border-borderDark/80 bg-black/20 p-8 shadow-depth-lg">
                  <div className="text-label">Full Report</div>
                  <div className="mt-5 space-y-5">
                    {sections.length > 0
                      ? sections.map((section, index) => <ReportSection key={index} section={section} />)
                      : <p className="text-[15px] leading-7 text-slate-300">{stripMarkdown(deliverable.generated_content || "")}</p>}
                  </div>
                </Card>
                <Card className="border-borderDark/80 bg-black/20 p-8 shadow-depth-md">
                  <div className="text-label">Recommendations</div>
                  <div className="mt-4"><ReviewList items={deliverable.recommendations || []} empty="Recommendations are included in the complete report above." /></div>
                </Card>
              </>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
              <div className="text-label">Quality Checklist</div>
              <div className="mt-4 grid gap-3">
                {checklist.map((item, index) => (
                  <div key={`${item}-${index}`} className="flex gap-3 rounded-xl border border-borderDark/60 bg-black/25 p-3 text-[13px] leading-5 text-slate-300">
                    <span className="text-success">✓</span><span>{item}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md">
              <div className="text-label">Deliverable Metadata</div>
              <div className="mt-4 grid gap-3 text-[12px] leading-5 text-slate-500">
                <div>Job <span className="mono-value text-slate-300">#{compact(deliverable.job_id)}</span></div>
                <div>Agent <span className="text-slate-300">{compact(deliverable.agent_name || deliverable.agent_id)}</span></div>
                <div>Created <span className="text-slate-300">{new Date(deliverable.created_at).toLocaleString()}</span></div>
                <button onClick={() => copy("Hash copied", deliverable.deliverable_hash)} className="rounded-lg border border-borderDark bg-black/30 p-3 text-left mono-value text-slate-300 transition-colors hover:border-accent/30">Hash {shorten(deliverable.deliverable_hash)}</button>
                <button onClick={() => copy("URI copied", deliverable.deliverable_uri)} className="rounded-lg border border-borderDark bg-black/30 p-3 text-left mono-value text-slate-300 transition-colors hover:border-accent/30">URI {shorten(deliverable.deliverable_uri)}</button>
                {copied && <div className="text-success">{copied}</div>}
              </div>
            </Card>

            {preview && !disputed && response?.jobStatus === "Submitted" && (
              <Card className="border-accent/20 bg-accent/[0.04] p-6 shadow-depth-md">
                <div className="text-label text-accent">Escrow Review</div>
                <p className="mt-3 text-[13px] leading-6 text-slate-300">Preview enough to approve or dispute the work.</p>
                <div className="mt-4 grid gap-3">
                  <Button onClick={approveAndRelease} disabled={!canApprove || !wallet.isConnected || !wallet.correctNetwork || !addresses}>
                    Approve And Release
                  </Button>
                  <Button variant="danger" onClick={() => deliverable.job_id && router.push(`/jobs/${deliverable.job_id}#review`)} disabled={!canApprove}>
                    Reject To Dispute
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
