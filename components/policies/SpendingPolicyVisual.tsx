import { formatUsd } from "../../lib/design/copy";
import type { SpendingPolicyView } from "../../lib/sdk/types";

function asUsdc(value: bigint | string | number) {
  return Number(value) / 1_000_000;
}

export function SpendingPolicyVisual({ policy }: { policy: SpendingPolicyView }) {
  const checkIcon = (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-success" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
  
  const xIcon = (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-danger" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="flex flex-col gap-3">
        <h4 className="text-label mb-1">Limits</h4>
        <div className="flex justify-between items-center pb-2 border-b border-borderDark/50">
          <span className="text-[13px] leading-5 text-slate-300">Max Spend Per Job</span>
          <span className="mono-value text-sm text-white">{formatUsd(asUsdc(policy.maxSpendPerJob))}</span>
        </div>
        <div className="flex justify-between items-center pb-2 border-b border-borderDark/50">
          <span className="text-[13px] leading-5 text-slate-300">Daily Spend Limit</span>
          <span className="mono-value text-sm text-white">{formatUsd(asUsdc(policy.dailySpendLimit))}</span>
        </div>
      </div>
      
      <div className="flex flex-col gap-3">
        <h4 className="text-label mb-1">Permissions</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-panelSolid border border-borderDark">
            {policy.allowData ? checkIcon : xIcon}
            <span className="text-[12px] font-medium leading-none text-slate-300">Data Auth</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-panelSolid border border-borderDark">
            {policy.allowApi ? checkIcon : xIcon}
            <span className="text-[12px] font-medium leading-none text-slate-300">API Calls</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-panelSolid border border-borderDark">
            {policy.allowCompute ? checkIcon : xIcon}
            <span className="text-[12px] font-medium leading-none text-slate-300">Compute</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-panelSolid border border-borderDark">
            {policy.allowOtherAgents ? checkIcon : xIcon}
            <span className="text-[12px] font-medium leading-none text-slate-300">Sub-Agents</span>
          </div>
        </div>
      </div>
    </div>
  );
}
