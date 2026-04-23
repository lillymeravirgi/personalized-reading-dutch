import { motion } from "framer-motion";
import type { LikertScale } from "../../types";

type Props = {
  question: string;
  /** Optional short label shown above the question (e.g. "UES-SF · Focused Attention"). */
  tag?: string;
  value: LikertScale | null;
  onChange: (v: LikertScale) => void;
  /** Left / right anchor labels for the scale. */
  anchors?: { left: string; right: string };
};

const SCALE: LikertScale[] = [1, 2, 3, 4, 5];

export default function LikertQuestion({
  question,
  tag,
  value,
  onChange,
  anchors = { left: "Strongly disagree", right: "Strongly agree" },
}: Props) {
  return (
    <div className="space-y-3">
      {tag && (
        <span className="text-[10px] font-heading font-semibold uppercase tracking-wide text-primary/80">
          {tag}
        </span>
      )}
      <p className="text-sm font-body text-text leading-relaxed">{question}</p>

      <div className="flex items-center gap-2">
        {SCALE.map((n) => {
          const selected = value === n;
          return (
            <motion.button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              whileTap={{ scale: 0.9 }}
              whileHover={!selected ? { y: -1 } : {}}
              className={[
                "flex-1 h-10 rounded-xl border text-sm font-heading font-semibold transition-colors",
                selected
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-text/70 border-black/12 hover:border-black/25 hover:bg-black/[0.02]",
              ].join(" ")}
              aria-pressed={selected}
              aria-label={`${n} out of 5`}
            >
              {n}
            </motion.button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[11px] font-body text-text/40">
        <span>{anchors.left}</span>
        <span>{anchors.right}</span>
      </div>
    </div>
  );
}
