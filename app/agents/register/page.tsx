"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { keccak256, stringToHex, type Address } from "viem";
import { PageHeader } from "../../../components/layout/PageHeader";
import { TxStatus } from "../../../components/shared/TxStatus";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { WalletFundsNotice } from "../../../components/wallet/WalletFundsNotice";
import { agentRegistryAbi } from "../../../lib/contracts/browser-abis";
import { getBrowserContractAddresses } from "../../../lib/contracts/browser-addresses";
import { useArcTransaction } from "../../../lib/contracts/hooks";

export default function RegisterAgent() {
  const router = useRouter();
  const addresses = getBrowserContractAddresses();
  const { tx, run, wallet } = useArcTransaction();
  const [formData, setFormData] = useState({ name: "", category: "", metadataUri: "", skills: "", operatingWallet: "", reserveWallet: "" });
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet.address) return;
    setFormData((current) => ({
      ...current,
      operatingWallet: current.operatingWallet || wallet.address || "",
      reserveWallet: current.reserveWallet || wallet.address || ""
    }));
  }, [wallet.address]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!addresses) return;
    let metadataUri = formData.metadataUri.trim();
    setMetadataMessage(null);
    if (!metadataUri) {
      try {
        const response = await fetch("/api/agents/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name,
            category: formData.category,
            skills: formData.skills,
            ownerWallet: wallet.address,
            operatingWallet: formData.operatingWallet,
            reserveWallet: formData.reserveWallet
          })
        });
        const data = await response.json();
        if (data.ok && data.metadataURI) {
          metadataUri = data.metadataURI;
          setMetadataMessage(data.saved ? "Metadata generated and saved." : "Metadata URI generated locally. Supabase storage is not configured or unavailable.");
        }
      } catch {
        const slug = formData.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
        const shortWallet = (wallet.address || "0x0000").slice(0, 6);
        metadataUri = `arcpilot://agent/${slug}-${shortWallet}-${Math.floor(Date.now() / 1000)}`;
        setMetadataMessage("Metadata URI generated locally. Supabase storage is unavailable.");
      }
      if (!metadataUri) {
        const slug = formData.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
        const shortWallet = (wallet.address || "0x0000").slice(0, 6);
        metadataUri = `arcpilot://agent/${slug}-${shortWallet}-${Math.floor(Date.now() / 1000)}`;
        setMetadataMessage("Metadata URI generated locally. Supabase storage is unavailable.");
      }
    }
    const hash = await run("Register agent", {
      address: addresses.AgentRegistry,
      abi: agentRegistryAbi,
      functionName: "registerAgent",
      args: [
        formData.name.trim(),
        formData.category.trim(),
        metadataUri,
        keccak256(stringToHex(formData.skills.trim())),
        formData.operatingWallet as Address,
        formData.reserveWallet as Address
      ]
    });
    if (hash) router.push("/agents");
  }

  const unavailable = !wallet.isConnected ? "Connect Wallet to register an agent." : !wallet.correctNetwork ? "Switch to Arc Testnet to register an agent." : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 animate-fadeInUp">
      <PageHeader title="Register Agent" description="Create an AI agent identity directly on Arc Testnet." />
      <Card className="border-borderDark/80 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.03),transparent_50%),linear-gradient(180deg,rgba(15,23,42,0.6),rgba(8,12,24,0.8))] p-10 shadow-depth-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          <div className="space-y-6">
            <Input label="Agent Name" placeholder="ResearchPilot" required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} />
            <Input label="Category" placeholder="Research" required value={formData.category} onChange={(event) => setFormData({ ...formData, category: event.target.value })} />
            <Input label="Skills" placeholder="Arc research, market intelligence, technical summaries" required value={formData.skills} onChange={(event) => setFormData({ ...formData, skills: event.target.value })} />
            <Input label="Operating Wallet" placeholder="0x..." required value={formData.operatingWallet} onChange={(event) => setFormData({ ...formData, operatingWallet: event.target.value })} />
            <Input label="Reserve Wallet" placeholder="0x..." required value={formData.reserveWallet} onChange={(event) => setFormData({ ...formData, reserveWallet: event.target.value })} />
            <details className="rounded-xl border border-borderDark bg-black/20 p-4">
              <summary className="cursor-pointer text-[12px] font-medium uppercase tracking-[0.18em] text-slate-400">Advanced metadata</summary>
              <div className="mt-4 space-y-4">
                <div className="text-[13px] leading-6 text-slate-500">
                  Optional. ArcPilot will generate metadata automatically if left blank. Metadata is a reference to extra agent information. ArcPilot generates it automatically, so most users can leave this blank.
                </div>
                <Input label="Metadata URI" placeholder="arcpilot://agent/..." value={formData.metadataUri} onChange={(event) => setFormData({ ...formData, metadataUri: event.target.value })} />
              </div>
            </details>
          </div>
          {metadataMessage && <div className="rounded-xl border border-info/20 bg-info/5 p-4 text-[13px] leading-6 text-info/75">{metadataMessage}</div>}
          <div className="rounded-xl border border-info/20 bg-info/5 p-5 text-[13px] leading-6 text-info/75">
            Registration writes the agent identity on Arc Testnet. Deposit a trust bond from the agent treasury after registration.
          </div>
          <TxStatus tx={tx} />
          <WalletFundsNotice />
          <div className="flex justify-end gap-4 border-t border-borderDark/50 pt-6">
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={Boolean(unavailable) || tx.phase === "pending" || tx.phase === "confirming"} title={unavailable}>
              {tx.phase === "pending" || tx.phase === "confirming" ? "Registering..." : unavailable || "Register Agent"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
