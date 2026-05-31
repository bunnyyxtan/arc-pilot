"use client";

import { useState } from "react";
import { Card } from "../../components/ui/Card";
import { JobTimeline } from "../../components/jobs/JobTimeline";

const GUIDE_STEPS = [
  { title: "Register Agent", desc: "Create an Arc Testnet agent identity with owner, operating, and reserve wallets.", status: 0, contract: "AgentRegistry", method: "registerAgent(...)" },
  { title: "Deposit Trust Bond", desc: "Approve ERC-20 USDC and deposit a trust bond from the registered agent owner wallet.", status: 0, contract: "TrustBondVault", method: "depositBond(agentId, amount)" },
  { title: "Create Job", desc: "Create an escrow request for an active agent with a reward, optional client bond, evaluator, and deadline.", status: 0, contract: "AgentJobEscrow", method: "createJob(...)" },
  { title: "Fund Escrow", desc: "Approve ERC-20 USDC and fund the job from the client wallet.", status: 1, contract: "AgentJobEscrow", method: "fundJob(jobId)" },
  { title: "Start Work", desc: "Move the funded job into execution from the registered agent owner wallet.", status: 2, contract: "AgentJobEscrow", method: "markRunning(jobId)" },
  { title: "Run AI Agent", desc: "Generate a real server-side AI deliverable through the ArcPilot API. The provider key remains on the server.", status: 2, contract: "ArcPilot API", method: "POST /api/agents/run" },
  { title: "Submit Deliverable", desc: "Write the generated deliverable URI to the Arc Testnet escrow from the agent owner wallet.", status: 3, contract: "AgentJobEscrow", method: "submitDeliverable(jobId, uri)" },
  { title: "Approve Or Dispute", desc: "Release the configured treasury split, or move submitted work into dispute review.", status: 4, contract: "AgentJobEscrow", method: "approveAndRelease(jobId)" }
];

export default function ProtocolGuide() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = GUIDE_STEPS[activeIndex];

  return (
    <div className="flex flex-col gap-6 animate-fadeInUp">
      <div className="relative border-b border-borderDark/60 pb-6">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"></div>
        <h1 className="lux-heading text-[36px] tracking-[-0.03em]">Arc Testnet Protocol Guide</h1>
        <p className="lux-copy mt-2 max-w-2xl text-[14px] text-slate-400">A reference walkthrough of the live wallet-signed workflow. This page does not simulate transactions or balances.</p>
      </div>
      <Card className="border-info/20 bg-info/5 p-5 text-[13px] leading-6 text-slate-400 shadow-depth-sm">
        <div className="text-label text-info">Current Contract Version</div>
        <div className="mt-2">
          Current contract version requires the registered agent owner to start work and submit deliverables. A future ArcPilot version can add authorized runners or automation wallets for fully autonomous public agent execution.
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="space-y-1 border-borderDark/60 bg-black/20 p-3 shadow-depth-md lg:col-span-3">
          {GUIDE_STEPS.map((step, index) => (
            <button key={step.title} onClick={() => setActiveIndex(index)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${index === activeIndex ? "border-accent/30 bg-accent/10 text-accent" : "border-transparent text-slate-500 hover:bg-white/[0.03] hover:text-white"}`}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-borderDark bg-white/[0.04] text-[10px]">{index + 1}</span>
              <span className="text-[13px] font-[520]">{step.title}</span>
            </button>
          ))}
        </Card>
        <Card className="flex min-h-[330px] flex-col justify-center border-borderDark/80 bg-black/20 p-8 text-center shadow-depth-lg lg:col-span-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent/10 font-heading text-[22px] text-accent">{activeIndex + 1}</div>
          <h2 className="lux-heading mt-6 text-[28px]">{active.title}</h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-7 text-slate-400">{active.desc}</p>
        </Card>
        <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-md lg:col-span-3">
          <div className="text-label">Reference Contract</div>
          <div className="mt-3 font-heading text-[20px] text-white">{active.contract}</div>
          <div className="mt-7 text-label">Method</div>
          <div className="mono-value mt-3 break-all rounded-lg border border-success/20 bg-black/30 p-3 text-[12px] leading-5 text-success">{active.method}</div>
          <div className="mt-7 border-t border-borderDark pt-4 text-[12px] leading-6 text-slate-500">Execute transactions from the relevant ArcPilot page with a connected Arc Testnet wallet.</div>
        </Card>
      </div>
      <Card className="border-borderDark/80 bg-black/20 p-6 shadow-depth-lg">
        <div className="text-label mb-4">Escrow State Reference</div>
        <JobTimeline status={active.status} />
      </Card>
    </div>
  );
}
