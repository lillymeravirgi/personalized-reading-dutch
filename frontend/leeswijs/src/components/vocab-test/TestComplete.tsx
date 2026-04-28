import { ArrowRight, CheckCircle2, RotateCcw } from "lucide-react";
import type { VocabTestPhase } from "../../types";

type Props = {
  correct: number;
  total: number;
  phase: VocabTestPhase;
  continueLabel: string;
  onContinue: () => void;
  onRetry: () => void;
};

export default function TestComplete({
  correct,
  total,
  phase,
  continueLabel,
  onContinue,
  onRetry,
}: Props) {
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);
  const title = phase === "DELAYED_24H" ? "Delayed test complete" : "Test complete";

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
        <CheckCircle2 size={30} className="text-emerald-600" strokeWidth={1.8} />
      </div>

      <h2 className="font-heading text-2xl font-bold text-text">{title}</h2>
      <p className="mt-1 max-w-sm text-sm font-body text-text/50">
        You answered {correct} out of {total} words correctly.
      </p>

      <div className="my-8">
        <span className="font-heading text-5xl font-bold text-primary">
          {pct}%
        </span>
        <p className="mt-1 text-xs font-body font-semibold uppercase tracking-wide text-text/45">
          vocabulary score
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/12 bg-white px-5 py-2.5 text-sm font-heading font-semibold text-text hover:bg-black/[0.03]"
        >
          <RotateCcw size={14} />
          Try again
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-heading font-semibold text-white hover:opacity-90"
        >
          {continueLabel}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
