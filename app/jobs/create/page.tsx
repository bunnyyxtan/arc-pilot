"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseUnits, zeroAddress, type Address } from "viem";
import { PageHeader } from "../../../components/layout/PageHeader";
import { TxStatus } from "../../../components/shared/TxStatus";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { Button } from "../../../components/ui/Button";
import { WalletFundsNotice } from "../../../components/wallet/WalletFundsNotice";
import { agentJobEscrowAbi } from "../../../lib/contracts/browser-abis";
import { getBrowserContractAddresses } from "../../../lib/contracts/browser-addresses";
import { useArcTransaction } from "../../../lib/contracts/hooks";

function encodeJobURI(input: { title: string; description: string; deliverableVisibility: "public" | "restricted"; jobMode: "marketplace" | "self_use"; scopeCheckId?: string; scopeDecision?: "allow" | "warn" | "block" }) {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `arcpilot-job://${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

function detectJobType(title: string, description: string) {
  const request = `${title} ${description}`.toLowerCase();
  if (/\b(?:research|analy[sz]e|report|study|investigat)\w*\b/.test(request)) return "research";
  if (/\b(?:trade|trading|token|chart|portfolio|price action)\w*\b/.test(request)) return "trading";
  if (/\b(?:write|content|post|thread|caption|script|blog)\w*\b/.test(request)) return "content";
  if (/\b(?:code|implement|build|debug|fix|api|sdk|contract)\w*\b/.test(request)) return "code";
  if (/\b(?:song|music|playlist|artist|album)\w*\b/.test(request)) return "music recommendation";
  return "general";
}

type ScopeResult = {
  scopeCheckId: string;
  selfUseAllowed: boolean;
  decision: {
    inScope: boolean;
    confidence: "low" | "medium" | "high";
    reason: string;
    matchedSkills: string[];
    missingCapabilities: string[];
    suggestedAction: "allow" | "warn" | "block";
    agentDomain: string;
    jobDomain: string;
  };
};

export default function CreateJob() {
  const router = useRouter();
  const addresses = getBrowserContractAddresses();
  const { tx, run, wallet } = useArcTransaction();
  const [formData, setFormData] = useState({ agentId: "", title: "", description: "", reward: "", clientBond: "", durationMinutes: "60", evaluator: "", deliverableVisibility: "restricted" as "public" | "restricted", jobMode: "marketplace" as "marketplace" | "self_use" });
  const [scopeResult, setScopeResult] = useState<ScopeResult | null>(null);
  const [scopeFingerprint, setScopeFingerprint] = useState("");
  const [scopeOverride, setScopeOverride] = useState(false);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);

  useEffect(() => {
    const selectedAgent = new URLSearchParams(window.location.search).get("agentId");
    if (selectedAgent) setFormData((current) => ({ ...current, agentId: current.agentId || selectedAgent }));
  }, []);

  const currentScopeFingerprint = JSON.stringify([formData.agentId, formData.title.trim(), formData.description.trim(), formData.jobMode]);
  const activeScopeResult = scopeFingerprint === currentScopeFingerprint ? scopeResult : null;

  async function checkScope() {
    setScopeLoading(true);
    setScopeError(null);
    try {
      const response = await fetch(`/api/agents/${formData.agentId}/scope-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: formData.title,
          jobDescription: formData.description,
          jobType: detectJobType(formData.title, formData.description),
          jobMode: formData.jobMode,
          clientWallet: wallet.address || null
        })
      });
      const data = await response.json();
      if (!response.ok || !data.decision || !data.scopeCheckId) throw new Error(data.error || "Agent scope check failed.");
      const next = data as ScopeResult;
      setScopeResult(next);
      setScopeFingerprint(currentScopeFingerprint);
      setScopeOverride(false);
      return next;
    } catch (error) {
      setScopeError(error instanceof Error ? error.message : "Agent scope check failed.");
      return null;
    } finally {
      setScopeLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!addresses) return;
    const checked = activeScopeResult ?? await checkScope();
    if (!checked) return;
    const blockedMarketplace = checked.decision.suggestedAction === "block" && !checked.selfUseAllowed;
    const warningNeedsConfirmation = checked.decision.suggestedAction === "warn" && !scopeOverride;
    if (blockedMarketplace || warningNeedsConfirmation) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(formData.durationMinutes) * 60);
    const hash = await run("Create job", {
      address: addresses.AgentJobEscrow,
      abi: agentJobEscrowAbi,
      functionName: "createJob",
      args: [
        BigInt(formData.agentId),
        (formData.evaluator.trim() || zeroAddress) as Address,
        parseUnits(formData.reward, 6),
        parseUnits(formData.clientBond || "0", 6),
        deadline,
        encodeJobURI({ title: formData.title.trim(), description: formData.description.trim(), deliverableVisibility: formData.deliverableVisibility, jobMode: formData.jobMode, scopeCheckId: checked.scopeCheckId, scopeDecision: checked.decision.suggestedAction })
      ]
    });
    if (hash) router.push("/jobs");
  }

  const unavailable = !wallet.isConnected ? "Connect Wallet to create a job." : !wallet.correctNetwork ? "Switch to Arc Testnet to create a job." : undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 animate-fadeInUp">
      <PageHeader title="Create Job" description="Create an Arc Testnet USDC escrow for real AI agent work." />
      <Card className="border-borderDark/80 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.03),transparent_50%),linear-gradient(180deg,rgba(15,23,42,0.6),rgba(8,12,24,0.8))] p-10 shadow-depth-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          <div className="rounded-xl border border-info/20 bg-info/5 p-5 text-[13px] leading-6 text-slate-400">
            <div className="text-label text-info">Public Agent Hiring</div>
            <div className="mt-2">
              Anyone can hire this public agent by creating and funding a job. The agent owner is responsible for starting work and submitting the deliverable under the current contract version.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Input label="Agent ID" placeholder="1" type="number" min="1" required value={formData.agentId} onChange={(event) => setFormData({ ...formData, agentId: event.target.value })} />
            <Input label="Evaluator Wallet (Optional)" placeholder="Defaults to your wallet" value={formData.evaluator} onChange={(event) => setFormData({ ...formData, evaluator: event.target.value })} />
            <Input label="Reward (USDC)" placeholder="25" type="number" step="0.000001" min="0.000001" required value={formData.reward} onChange={(event) => setFormData({ ...formData, reward: event.target.value })} />
            <Input label="Client Bond (USDC)" placeholder="5" type="number" step="0.000001" min="0" required value={formData.clientBond} onChange={(event) => setFormData({ ...formData, clientBond: event.target.value })} />
            <Input label="Deadline (Minutes)" placeholder="60" type="number" min="1" required value={formData.durationMinutes} onChange={(event) => setFormData({ ...formData, durationMinutes: event.target.value })} />
            <Input label="Job Title" placeholder="Analyze Arc agentic economy opportunity" required value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} />
          </div>
          <Textarea label="Job Description" placeholder="Describe the required deliverable..." required value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} />
          <div className="rounded-xl border border-borderDark bg-black/20 p-5">
            <label className="text-label text-slate-400">Deliverable visibility</label>
            <select
              className="mt-3 w-full rounded-lg border border-borderDark bg-panelSolid px-3 py-2.5 text-[13px] leading-5 text-white focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
              value={formData.deliverableVisibility}
              onChange={(event) => setFormData({ ...formData, deliverableVisibility: event.target.value === "public" ? "public" : "restricted" })}
            >
              <option value="restricted">Restricted</option>
              <option value="public">Public</option>
            </select>
            <div className="mt-3 text-[13px] leading-6 text-slate-500">
              {formData.deliverableVisibility === "restricted"
                ? "Only client, agent owner, and evaluator can view the full result."
                : "Anyone with the link can view the result. Useful for demos and public proof-of-work."}
            </div>
            <div className="mt-2 text-[12px] leading-5 text-slate-600">Onchain proofs are public. Full deliverable content can be restricted.</div>
          </div>
          <div className="rounded-xl border border-borderDark bg-black/20 p-5">
            <label className="text-label text-slate-400">Job classification</label>
            <select
              className="mt-3 w-full rounded-lg border border-borderDark bg-panelSolid px-3 py-2.5 text-[13px] leading-5 text-white focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
              value={formData.jobMode}
              onChange={(event) => setFormData({ ...formData, jobMode: event.target.value === "self_use" ? "self_use" : "marketplace" })}
            >
              <option value="marketplace">Marketplace job</option>
              <option value="self_use">Self-use / test run</option>
            </select>
            <div className="mt-3 text-[13px] leading-6 text-slate-500">
              {formData.jobMode === "self_use"
                ? "Use only when the client wallet owns the selected agent. Self-use runs remain auditable but do not count toward public marketplace ratings."
                : "Marketplace output stays sealed until escrow approval. Third-party completed work can receive verified client ratings."}
            </div>
          </div>
          <div className="rounded-xl border border-success/20 bg-success/5 p-5 text-[13px] leading-6 text-success/75">
            Job creation records the request on Arc Testnet. Fund the escrow from the job page after the transaction confirms.
          </div>
          {activeScopeResult && activeScopeResult.decision.suggestedAction !== "allow" && (
            <div className={`rounded-xl border p-5 ${activeScopeResult.decision.suggestedAction === "block" && !activeScopeResult.selfUseAllowed ? "border-danger/30 bg-danger/5" : "border-warning/30 bg-warning/5"}`}>
              <div className={`text-label ${activeScopeResult.decision.suggestedAction === "block" && !activeScopeResult.selfUseAllowed ? "text-danger" : "text-warning"}`}>This agent is not designed for this task.</div>
              <div className="mt-3 text-[13px] leading-6 text-slate-300">{activeScopeResult.decision.reason} Pick a more suitable agent or edit your request.</div>
              {activeScopeResult.selfUseAllowed && <div className="mt-2 text-[12px] leading-5 text-warning">Explicit self-use mode allows this auditable test run, but the runner will return a scope refusal instead of unrelated work.</div>}
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="secondary" onClick={() => { setScopeResult(null); setScopeOverride(false); }}>Edit Request</Button>
                <Button type="button" variant="secondary" onClick={() => router.push("/agents")}>Choose Another Agent</Button>
                {activeScopeResult.decision.suggestedAction === "warn" && !scopeOverride && <Button type="button" onClick={() => setScopeOverride(true)}>Continue Anyway</Button>}
              </div>
            </div>
          )}
          {scopeError && <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-6 text-danger">{scopeError}</div>}
          <TxStatus tx={tx} />
          <WalletFundsNotice />
          <div className="flex justify-end gap-4 border-t border-borderDark/50 pt-6">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={Boolean(unavailable) || scopeLoading || tx.phase === "pending" || tx.phase === "confirming"} title={unavailable}>
              {scopeLoading ? "Checking Scope..." : tx.phase === "pending" || tx.phase === "confirming" ? "Creating..." : unavailable || "Create Job"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
