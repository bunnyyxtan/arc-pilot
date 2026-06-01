import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function ManualReviewRequest(props: {
  existingRequest: { reason: string; status?: string; resolver_note?: string | null } | null;
  reason: string;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  disabledReason?: string | null;
}) {
  return (
    <Card className="border-borderDark/70 bg-black/20 p-7 shadow-depth-md">
      <div className="text-label text-warning">Manual Appeal</div>
      {props.existingRequest ? (
        <div className="mt-4">
          <div className="inline-flex rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-warning">Manual Review Requested</div>
          <p className="mt-4 text-[13px] leading-6 text-slate-300">Your appeal has been added to the resolver queue.</p>
          <p className="mt-4 text-[13px] leading-6 text-slate-400">{props.existingRequest.reason}</p>
          <div className="mt-3 text-[12px] text-slate-500">Status: <span className="text-slate-300">{props.existingRequest.status || "open"}</span></div>
          {props.existingRequest.resolver_note && <div className="mt-3 text-[12px] leading-5 text-slate-500">Resolver note: <span className="text-slate-300">{props.existingRequest.resolver_note}</span></div>}
        </div>
      ) : (
        <>
          <p className="mt-3 text-[13px] leading-6 text-slate-400">Request a manual review if the AI recommendation needs human escalation.</p>
          <textarea
            className="mt-4 min-h-[110px] w-full rounded-xl border border-borderDark bg-black/40 p-4 text-[14px] leading-6 text-white outline-none transition-colors placeholder:text-slate-500 focus:border-accent"
            placeholder="Explain why the AI decision should be manually reviewed."
            value={props.reason}
            onChange={(event) => props.onReasonChange(event.target.value)}
          />
          {props.error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-5 text-danger">{props.error}</div>}
          {props.disabledReason && <div className="mt-3 text-[12px] leading-5 text-slate-500">{props.disabledReason}</div>}
          <Button className="mt-4" variant="secondary" onClick={props.onSubmit} disabled={props.loading || Boolean(props.disabledReason)}>
            {props.loading ? "Requesting..." : "Request Manual Review"}
          </Button>
        </>
      )}
    </Card>
  );
}
