import { useState } from "react";
import { BookOpenText, Check, Plus } from "lucide-react";
import type {
  InteractionAction,
  InteractionWeight,
  WordStatus,
} from "../../types";
import { logInteraction } from "../../services/api";
import { useStore } from "../../store";

type Props = {
  sessionId: string;
  wordId: string;
  hideContext?: boolean;
  hideAddToLearn?: boolean;
  onLogged: (action: InteractionAction) => void;
};

type ChoiceId = "context" | "learn" | "known";

const CHOICES: {
  id: ChoiceId;
  action: InteractionAction;
  weight: InteractionWeight;
  label: string;
  hint: string;
  icon: typeof BookOpenText;
  status?: WordStatus;
}[] = [
  {
    id: "context",
    action: "deep_processing",
    weight: 5,
    label: "Context",
    hint: "I want examples",
    icon: BookOpenText,
  },
  {
    id: "learn",
    action: "acquisition_intent",
    weight: 2,
    label: "Learn",
    hint: "Save for review",
    icon: Plus,
    status: "learning",
  },
  {
    id: "known",
    action: "word_avoidance",
    weight: 1,
    label: "Known",
    hint: "No review needed",
    icon: Check,
  },
];

export default function IntentChoice({
  sessionId,
  wordId,
  hideContext = false,
  hideAddToLearn = false,
  onLogged,
}: Props) {
  const [pending, setPending] = useState<InteractionAction | null>(null);
  const addInteraction = useStore((s) => s.addInteraction);
  const updateWordStatus = useStore((s) => s.updateWordStatus);
  const incrementExposure = useStore((s) => s.incrementExposure);
  const choices = CHOICES.filter((choice) => {
    if (hideContext && choice.id === "context") return false;
    if (hideAddToLearn && choice.id === "learn") return false;
    return true;
  });

  async function pick(action: InteractionAction, weight: InteractionWeight, status?: WordStatus) {
    if (pending) return;
    setPending(action);
    const interaction = {
      wordId,
      sessionId,
      action,
      weight,
      timestamp: new Date().toISOString(),
    };
    addInteraction(interaction);
    incrementExposure(wordId);
    if (status) updateWordStatus(wordId, status);
    try {
      await logInteraction(interaction);
    } catch {
      setPending(null);
    }
    onLogged(action);
    setPending(null);
  }

  const gridClass =
    choices.length === 1
      ? "grid grid-cols-1 gap-2"
      : choices.length === 2
        ? "grid grid-cols-2 gap-2"
        : "grid grid-cols-3 gap-2";

  return (
    <div className={gridClass}>
      {choices.map(({ id, action, weight, label, hint, icon: Icon, status }) => {
        const isPending = pending === action;
        const singleChoice = choices.length === 1;
        return (
          <button
            key={id}
            type="button"
            disabled={pending !== null}
            onClick={() => pick(action, weight, status)}
            className={[
              "flex rounded-lg border border-black/8 bg-white hover:border-primary/30 hover:bg-primary/[0.03]",
              "transition-colors",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              singleChoice
                ? "min-h-14 flex-row items-center justify-start gap-3 px-3.5 py-3 text-left"
                : "min-h-20 flex-col items-center justify-center gap-2 px-2.5 py-3 text-center",
              isPending ? "ring-2 ring-primary/40" : "",
            ].join(" ")}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon size={17} className="text-primary" />
            </div>
            <div>
              <div className="font-heading text-sm font-semibold leading-tight text-text">
                {label}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-text/45 font-body">
                {hint}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
