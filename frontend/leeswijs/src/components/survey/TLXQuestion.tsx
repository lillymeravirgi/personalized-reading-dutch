import { motion } from "framer-motion";
import type { TLXScale } from "../../types";

type Props = {
  question: string;
  /** Optional short label (e.g. "NASA-TLX · Mental Effort"). */
  tag?: string;
  value: TLXScale | null;
  onChange: (v: TLXScale) => void;
  anchors?: { left: string; right: string };
};

const SCALE: TLXScale[] = [1, 2, 3, 4, 5, 6, 7];

export default function TLXQuestion({
  question,
  tag,
  value,
  onChange,
  anchors = { left: "Very low", right: "Very high" },
}: Props) {
  return (
    <div className="space-y-3">
      {tag && (
        <span className="text-[10px] font-heading font-semibold uppercase tracking-wide text-secondary">
          {tag}
        </span>
      )}
      <p className="text-sm font-body text-text leading-relaxed">{question}</p>

      <div className="flex items-center gap-1.5">
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
                  ? "bg-secondary text-white border-secondary"
                  : "bg-white text-text/70 border-black/12 hover:border-black/25 hover:bg-black/[0.02]",
              ].join(" ")}
              aria-pressed={selected}
              aria-label={`${n} out of 7`}
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
