import type { TreasuryPolicyView } from "../../lib/sdk/types";

export function TreasurySplitVisual({ policy }: { policy: TreasuryPolicyView }) {
  const total = Number(policy.operatingBps) + Number(policy.reserveBps) + Number(policy.bondBps);
  // Default to 10000 if not set
  const divisor = total === 0 ? 10000 : total;
  
  const opPct = (Number(policy.operatingBps) / divisor) * 100;
  const resPct = (Number(policy.reserveBps) / divisor) * 100;
  const bondPct = (Number(policy.bondBps) / divisor) * 100;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 rounded-full overflow-hidden border border-borderDark">
        {opPct > 0 && <div style={{ width: `${opPct}%` }} className="bg-accent h-full transition-all"></div>}
        {resPct > 0 && <div style={{ width: `${resPct}%` }} className="bg-info h-full transition-all border-l border-panelSolid"></div>}
        {bondPct > 0 && <div style={{ width: `${bondPct}%` }} className="bg-success h-full transition-all border-l border-panelSolid"></div>}
      </div>
      <div className="flex flex-wrap gap-4 text-[13px] leading-5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-accent"></div>
          <span className="text-slate-300">Operating <span className="mono-value text-white">{opPct.toFixed(1)}%</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-info"></div>
          <span className="text-slate-300">Reserve <span className="mono-value text-white">{resPct.toFixed(1)}%</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-success"></div>
          <span className="text-slate-300">Bond <span className="mono-value text-white">{bondPct.toFixed(1)}%</span></span>
        </div>
      </div>
    </div>
  );
}
