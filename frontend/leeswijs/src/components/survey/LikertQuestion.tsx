import { motion } from "framer-motion";
import type { LikertScale } from "../../types";

type Props = {
  tag?: string;
  question: string;
  value: LikertScale | null;
  onChange: (v: LikertScale) => void;
  anchors?: { left: string; right: string };
};

const SCALE: LikertScale[] = [1, 2, 3, 4, 5];

export default function LikertQuestion({
  question,
  value,
  onChange,
  anchors = { left: "Strongly disagree", right: "Strongly agree" },
}: Props) {
  return (
    <div className="space-y-3">
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
                "min-h-11 flex-1 rounded-xl border text-sm font-heading font-semibold transition-colors",
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
