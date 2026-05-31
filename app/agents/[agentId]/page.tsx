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
import { AgentScoreRing } from "../../../components/agents/AgentScoreRing";
import { AgentStatsGrid } from "../../../components/agents/AgentStatsGrid";
import { SetupRequired } from "../../../components/layout/SetupRequired";
import { TxStatus } from "../../../components/shared/TxStatus";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Section } from "../../../components/ui/Section";
import { WalletFundsNotice } from "../../../components/wallet/WalletFundsNotice";
import { withPublicMarketplaceStats } from "../../../lib/reputation/public-stats";

export default function AgentDetails() {
  const params = useParams();
  const agentId = params?.agentId as string;
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

  const load = useCallback(async () => {
    try {
      if (!addresses || !publicClient) throw new Error("Arc Testnet contracts not configured.");
      const [nextAgent, jobs] = await Promise.all([
        readAgentView(publicClient, addresses, BigInt(agentId)),
        readJobs(publicClient, addresses)
      ]);
      setAgent(withPublicMarketplaceStats(nextAgent, jobs));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to read Arc Testnet agent.");
    } finally {
      setLoading(false);
    }
  }, [addresses, agentId, publicClient]);

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
    await transact("Deposit bond", { address: addresses!.TrustBondVault, abi: trustBondVaultAbi, functionName: "depositBond", args: [BigInt(agentId), amount] });
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
      if (!response.ok || !data.ok) throw new Error(data.error || "Metadata record not found. Onchain URI is still available.");
      setMetadataRecord(data.metadata);
    } catch (readError) {
      setMetadataError(readError instanceof Error ? readError.message : "Metadata record not found. Onchain URI is still available.");
    } finally {
      setMetadataLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-10 animate-fadeInUp">
      <div className="glass-card rounded-2xl border border-borderDark/80 bg-[radial-gradient(ellipse_at_top_right,rgba(147,197,253,0.12),transparent_60%),linear-gradient(180deg,rgba(15,23,42,0.8),rgba(8,12,24,0.9))] p-8 shadow-depth-lg">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <div className="flex items-center gap-8">
            <AgentScoreRing score={Number(agent.reputationScore)} size="lg" />
            <div>
              <h1 className="lux-heading text-[40px] tracking-[-0.03em]">{agent.name}</h1>
              <div className="mt-2 text-[15px] text-slate-400">{agent.category}</div>
              <div className="mono-value mt-3 text-[12px] text-slate-500">{displayId} / Onchain ID {String(agent.agentId)}</div>
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
        <div className="text-label text-warning">Marketplace Reputation</div>
        <div className="mt-2">
          Public passport metrics count third-party client work only. Self-use and test runs remain auditable onchain but do not increase public reputation.
        </div>
      </Card>
      <TxStatus tx={tx} />
      <WalletFundsNotice />
      <Section title="Performance Overview"><AgentStatsGrid stats={agent.stats} /></Section>
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
                <Button variant="secondary" onClick={() => transact("Request withdrawal", { address: addresses.TrustBondVault, abi: trustBondVaultAbi, functionName: "requestWithdraw", args: [BigInt(agentId), parseUnits(bondAmount || "0", 6)] })} disabled={!walletReady || !isOwner || !bondAmount || pending}>Request Withdrawal</Button>
                <Button variant="secondary" onClick={() => transact("Execute withdrawal", { address: addresses.TrustBondVault, abi: trustBondVaultAbi, functionName: "executeWithdraw", args: [BigInt(agentId)] })} disabled={!walletReady || !isOwner || pending}>Execute Withdrawal</Button>
                <Button variant="secondary" onClick={() => transact("Cancel withdrawal", { address: addresses.TrustBondVault, abi: trustBondVaultAbi, functionName: "cancelWithdraw", args: [BigInt(agentId)] })} disabled={!walletReady || !isOwner || pending}>Cancel Withdrawal</Button>
              </div>
              <div className="border-t border-borderDark pt-4">
                <div className="mb-3 text-label">Spending Policy</div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Per Job (USDC)" type="number" step="0.000001" value={maxSpend} onChange={(event) => setMaxSpend(event.target.value)} />
                  <Input label="Daily Limit (USDC)" type="number" step="0.000001" value={dailySpend} onChange={(event) => setDailySpend(event.target.value)} />
                </div>
                <Button className="mt-3 w-full" variant="secondary" onClick={() => transact("Update spending policy", { address: addresses.SpendingPolicyManager, abi: spendingPolicyManagerAbi, functionName: "setPolicy", args: [BigInt(agentId), parseUnits(maxSpend || "0", 6), parseUnits(dailySpend || "0", 6), true, true, true, false] })} disabled={!walletReady || !isOwner || !maxSpend || !dailySpend || pending}>Update Spending Policy</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
