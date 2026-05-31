import { Button } from "../ui/Button";

interface DisputeConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  jobId: string;
  agentDisplayId: string;
  lockedReward: string;
  clientBond: string;
  category: string;
  reason: string;
  onCategoryChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  confirmDisabledReason?: string | null;
  loading?: boolean;
  error?: string | null;
}

export function DisputeConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  jobId,
  agentDisplayId,
  lockedReward,
  clientBond,
  category,
  reason,
  onCategoryChange,
  onReasonChange,
  confirmDisabledReason = null,
  loading = false,
  error = null
}: DisputeConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-lg rounded-2xl border border-borderDark bg-black shadow-depth-lg animate-fadeInUp">
        <div className="p-6">
          <h2 className="lux-heading text-2xl text-danger mb-3">Reject work and open dispute?</h2>
          <p className="text-[14px] leading-relaxed text-slate-300 mb-6">
            This will challenge the agent's deliverable and open an onchain dispute. Your rejection reason will be saved as dispute metadata. False or bad-faith rejection may risk your client bond.
          </p>

          <div className="space-y-4 rounded-xl border border-borderDark/60 bg-white/[0.02] p-5 mb-6">
            <div className="flex justify-between border-b border-borderDark pb-3">
              <span className="text-label">Job ID</span>
              <span className="mono-value text-[13px] text-white">#{jobId}</span>
            </div>
            <div className="flex justify-between border-b border-borderDark pb-3">
              <span className="text-label">Agent</span>
              <span className="mono-value text-[13px] text-white">{agentDisplayId}</span>
            </div>
            <div className="flex justify-between border-b border-borderDark pb-3">
              <span className="text-label">Locked Reward</span>
              <span className="mono-value text-[13px] text-success">{lockedReward}</span>
            </div>
            <div className="flex justify-between border-b border-borderDark pb-3">
              <span className="text-label">Client Bond Risk</span>
              <span className="mono-value text-[13px] text-warning">{clientBond}</span>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <label className="text-label" htmlFor="dispute-category">Category</label>
              <select
                id="dispute-category"
                className="w-full rounded-xl border border-borderDark bg-black/40 px-4 py-3 text-[14px] text-white outline-none transition-colors focus:border-accent"
                value={category}
                onChange={(event) => onCategoryChange(event.target.value)}
              >
                <option value="">Select a category (optional)</option>
                <option value="Incomplete work">Incomplete work</option>
                <option value="Incorrect output">Incorrect output</option>
                <option value="Did not follow instructions">Did not follow instructions</option>
                <option value="Low quality">Low quality</option>
                <option value="Duplicate / spam">Duplicate / spam</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-label" htmlFor="dispute-reason">Reason</label>
              <textarea
                id="dispute-reason"
                className="min-h-[120px] w-full rounded-xl border border-borderDark bg-black/40 p-4 text-[14px] text-white outline-none transition-colors placeholder:text-slate-500 focus:border-accent"
                placeholder="Explain what is wrong with the deliverable..."
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
              />
              <div className="text-[12px] leading-5 text-slate-500">Minimum 20 characters. This reason becomes dispute metadata before the wallet transaction opens.</div>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-5 text-danger">
              {error}
            </div>
          )}

          {confirmDisabledReason && (
            <div className="mb-5 text-[12px] leading-5 text-slate-500">{confirmDisabledReason}.</div>
          )}

          <div className="flex gap-4">
            <Button variant="secondary" className="w-full" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button variant="danger" className="w-full" onClick={onConfirm} disabled={loading || Boolean(confirmDisabledReason)}>
              {loading ? "Confirming..." : "Open Dispute"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
