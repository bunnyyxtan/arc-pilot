import { shortenAddress } from "../../lib/design/copy";
import type { DisputeEvidenceRow } from "../../lib/supabase/types";
import { Card } from "../ui/Card";

const ROLE_LABELS: Record<string, string> = {
  client: "Client",
  agent: "Agent Owner",
  resolver: "Resolver",
};

export function EvidenceTimeline({ evidence }: { evidence: DisputeEvidenceRow[] }) {
  if (evidence.length === 0) {
    return (
      <Card className="border-dashed border-borderDark/80 bg-white/[0.01] p-7 text-[13px] text-slate-500">
        No evidence has been submitted yet.
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {evidence.map((item) => {
        const roleLabel = item.submitted_by_role ? ROLE_LABELS[item.submitted_by_role] || item.submitted_by_role : null;
        return (
          <Card key={item.evidence_uri || item.id} className="border-borderDark/60 bg-black/20 p-6 shadow-depth-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {roleLabel && (
                  <span className="rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-accent">
                    {roleLabel}
                  </span>
                )}
                <span className="mono-value text-[11px] text-slate-500">
                  {shortenAddress(item.submitted_by_wallet || "")}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                {item.created_at ? new Date(item.created_at).toLocaleString() : "Timestamp pending"}
              </div>
            </div>
            <p className="mt-4 text-[13px] leading-6 text-slate-300">{item.evidence_text}</p>
            {item.supporting_link && (
              <a
                className="mt-3 inline-block text-[12px] text-accent hover:text-white transition-colors"
                href={item.supporting_link}
                target="_blank"
                rel="noreferrer"
              >
                Open supporting link
              </a>
            )}
            {item.tx_hash && (
              <div className="mt-2 mono-value text-[11px] text-slate-500">
                tx: {item.tx_hash.slice(0, 10)}...{item.tx_hash.slice(-6)}
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">
                Developer details
              </summary>
              <div className="mono-value mt-2 text-[10px] leading-5 text-slate-600 break-all">
                URI: {item.evidence_uri || "Not recorded"}
              </div>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
