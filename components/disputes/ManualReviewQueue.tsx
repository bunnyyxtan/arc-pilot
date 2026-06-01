import { useState } from "react";
import { shortenAddress } from "../../lib/design/copy";
import type { ManualReviewRequestRow } from "../../lib/supabase/types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Textarea } from "../ui/Textarea";

export function ManualReviewQueue(props: {
  requests: ManualReviewRequestRow[];
  loading: boolean;
  error: string | null;
  onUpdate: (requestId: string, status: "accepted" | "resolved" | "rejected", resolverNote: string) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});

  return (
    <Card className="border-accent/20 bg-black/20 p-7 shadow-depth-md">
      <div className="text-label text-accent">Resolver Appeal Queue</div>
      <p className="mt-3 text-[13px] leading-6 text-slate-400">Review participant appeals and record the current queue status.</p>
      <div className="mt-5 grid gap-4">
        {props.requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-borderDark/80 p-5 text-[13px] text-slate-500">No manual appeals have been queued for this dispute.</div>
        ) : props.requests.map((request) => (
          <div key={request.id || `${request.dispute_id}-${request.requested_by_wallet}-${request.created_at}`} className="rounded-xl border border-borderDark/70 bg-black/30 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="mono-value text-[11px] text-slate-500">{shortenAddress(request.requested_by_wallet || "")}</div>
              <span className="rounded-full border border-warning/25 bg-warning/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-warning">{request.status}</span>
            </div>
            <p className="mt-4 text-[13px] leading-6 text-slate-300">{request.reason}</p>
            <div className="mt-3 text-[11px] text-slate-500">{request.created_at ? new Date(request.created_at).toLocaleString() : "Timestamp pending"}</div>
            <Textarea
              className="mt-4 min-h-[80px]"
              label="Resolver note (optional)"
              placeholder="Record a short queue note for this appeal."
              value={notes[request.id || ""] || ""}
              onChange={(event) => setNotes((current) => ({ ...current, [request.id || ""]: event.target.value }))}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button size="sm" variant="secondary" onClick={() => request.id && props.onUpdate(request.id, "accepted", notes[request.id] || "")} disabled={props.loading || !request.id}>Accept Review</Button>
              <Button size="sm" variant="success" onClick={() => request.id && props.onUpdate(request.id, "resolved", notes[request.id] || "")} disabled={props.loading || !request.id}>Mark Resolved</Button>
              <Button size="sm" variant="danger" onClick={() => request.id && props.onUpdate(request.id, "rejected", notes[request.id] || "")} disabled={props.loading || !request.id}>Reject Appeal</Button>
            </div>
          </div>
        ))}
      </div>
      {props.error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-5 text-danger">{props.error}</div>}
    </Card>
  );
}
