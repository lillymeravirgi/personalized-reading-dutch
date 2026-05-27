import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const STEPS = [
  "Preparing a Dutch reading...",
  "The server may need a moment to wake up...",
  "Writing and checking the text...",
  "Still working. Please keep this page open.",
] as const;

type Props = {
  className?: string;
};

export default function ReadingGenerationStatus({ className = "" }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    const timers = [
      window.setTimeout(() => setStep(1), 6_000),
      window.setTimeout(() => setStep(2), 22_000),
      window.setTimeout(() => setStep(3), 45_000),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  return (
    <div
      className={[
        "flex items-center gap-2 rounded-xl border border-primary/15",
        "bg-primary/[0.04] px-3.5 py-2 text-xs font-body text-primary/80",
        className,
      ].join(" ")}
    >
      <Loader2 size={14} className="animate-spin shrink-0" />
      <span>{STEPS[step]}</span>
    </div>
  );
}
