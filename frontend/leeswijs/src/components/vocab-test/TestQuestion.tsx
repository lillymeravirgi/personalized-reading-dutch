import { CheckCircle2 } from "lucide-react";
import SpeakButton from "../SpeakButton";

type Props = {
  word: string;
  prompt: string;
  options: string[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
};

export default function TestQuestion({
  word,
  prompt,
  options,
  selectedIndex,
  onSelect,
}: Props) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-body font-semibold uppercase tracking-wide text-text/45">
          Target word
        </p>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="font-heading text-3xl font-bold text-text">
            {word}
          </h2>
          <SpeakButton
            text={word}
            label={`Play pronunciation for ${word}`}
            className="h-9 w-9 shrink-0"
          />
        </div>
        <p className="mt-2 text-sm font-body text-text/55">{prompt}</p>
      </div>

      <div className="grid gap-2.5">
        {options.map((option, index) => {
          const active = selectedIndex === index;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onSelect(index)}
              className={[
                "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                "text-left text-sm font-body transition-colors",
                active
                  ? "border-primary bg-primary/5 text-text"
                  : "border-black/10 bg-white text-text/75 hover:border-primary/30 hover:bg-primary/[0.02]",
              ].join(" ")}
            >
              <span>{option}</span>
              {active && <CheckCircle2 size={16} className="text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
