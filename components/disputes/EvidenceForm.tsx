import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";

export function EvidenceForm(props: {
  evidenceText: string;
  supportingLink: string;
  onEvidenceTextChange: (value: string) => void;
  onSupportingLinkChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  disabledReason?: string | null;
}) {
  return (
    <Card className="border-borderDark/60 bg-black/20 p-7 shadow-depth-md">
      <div className="text-label text-accent">Add Case Evidence</div>
      <p className="mt-3 text-[13px] leading-6 text-slate-400">
        Add a concise factual note for the resolver. ArcPilot stores the readable record and submits a linked evidence URI onchain.
      </p>
      <div className="mt-5 grid gap-4">
        <Textarea
          label="Evidence note"
          placeholder="Explain the new evidence, what it proves, and why it matters to this dispute."
          value={props.evidenceText}
          onChange={(event) => props.onEvidenceTextChange(event.target.value)}
        />
        <Input
          label="Supporting link (optional)"
          placeholder="https://..."
          value={props.supportingLink}
          onChange={(event) => props.onSupportingLinkChange(event.target.value)}
        />
      </div>
      {props.error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] leading-5 text-danger">{props.error}</div>}
      {props.disabledReason && <div className="mt-3 text-[12px] leading-5 text-slate-500">{props.disabledReason}</div>}
      <Button className="mt-5 w-full" onClick={props.onSubmit} disabled={props.loading || Boolean(props.disabledReason)}>
        {props.loading ? "Saving Evidence..." : "Save and Submit Evidence"}
      </Button>
    </Card>
  );
}
