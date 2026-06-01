"use client";

import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";

export type ReviewContext = "approval" | "dispute";

export function JobFeedbackModal(props: {
  isOpen: boolean;
  context: ReviewContext;
  rating: number;
  reviewText: string;
  submitting: boolean;
  sessionReady: boolean;
  sessionSigning?: boolean;
  error?: string | null;
  onRatingChange: (rating: number) => void;
  onReviewTextChange: (value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onVerifySession: () => void;
}) {
  if (!props.isOpen) return null;
  const dispute = props.context === "dispute";

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl border border-borderLight/30 bg-[#080d19]/95 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.6)] animate-fadeInUp">
        <div className="border-b border-borderDark pb-4">
          <h2 className="font-heading text-[24px] font-medium text-white">{dispute ? "Share feedback" : "Rate this agent"}</h2>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">
            {dispute ? "Help future clients understand what could be improved." : "Share an optional client review for the completed work."}
          </p>
        </div>

        <div className="mt-5 flex gap-2" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              key={rating}
              type="button"
              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-[18px] transition-all ${rating <= props.rating ? "border-warning/35 bg-warning/10 text-warning" : "border-borderDark bg-black/25 text-slate-600 hover:border-warning/25 hover:text-warning"}`}
              onClick={() => props.onRatingChange(rating)}
              aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
            >
              &#9733;
            </button>
          ))}
        </div>

        <Textarea
          className="mt-5 min-h-[96px]"
          label={dispute ? "What could be improved? (optional)" : "Review (optional)"}
          placeholder={dispute ? "Share concise feedback about the result." : "Share concise feedback about the completed work."}
          value={props.reviewText}
          onChange={(event) => props.onReviewTextChange(event.target.value)}
        />

        {props.error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-3 text-[13px] leading-5 text-danger">{props.error}</div>}

        <div className="mt-6 flex gap-3">
          <Button className="flex-1" variant="secondary" onClick={props.onSkip} disabled={props.submitting}>Skip</Button>
          {!props.sessionReady ? (
            <Button className="flex-1" onClick={props.onVerifySession} disabled={props.sessionSigning}>
              {props.sessionSigning ? "Waiting For Signature..." : "Verify Wallet"}
            </Button>
          ) : <Button className="flex-1" onClick={props.onSubmit} disabled={props.submitting || props.rating < 1}>
            {props.submitting ? "Submitting..." : dispute ? "Submit Feedback" : "Submit Review"}
          </Button>}
        </div>
      </div>
    </div>
  );
}
