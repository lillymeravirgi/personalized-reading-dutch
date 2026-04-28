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
  onLogged: (action: InteractionAction) => void;
};

// Weights must match the backend IntentTagType.
const CHOICES: {
  action: InteractionAction;
  weight: InteractionWeight;
  label: string;
  hint: string;
  icon: typeof BookOpenText;
  // If picked, how should we mutate the local word status?
  status?: WordStatus;
}[] = [
  {
    action: "see_examples",
    weight: 5,
    label: "Context",
    hint: "I want examples",
    icon: BookOpenText,
  },
  {
    action: "add_to_learn",
    weight: 2,
    label: "Learn",
    hint: "Save for review",
    icon: Plus,
    status: "learning",
  },
  {
    action: "ignore",
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
  onLogged,
}: Props) {
  const [pending, setPending] = useState<InteractionAction | null>(null);
  const addInteraction = useStore((s) => s.addInteraction);
  const updateWordStatus = useStore((s) => s.updateWordStatus);
  const incrementExposure = useStore((s) => s.incrementExposure);
  const choices = hideContext
    ? CHOICES.filter((choice) => choice.action !== "see_examples")
    : CHOICES;

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
      // Telemetry is fire-and-forget; swallow to avoid blocking UX.
    }
    onLogged(action);
    setPending(null);
  }

  return (
    <div className={choices.length === 2 ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
      {choices.map(({ action, weight, label, hint, icon: Icon, status }) => {
        const isPending = pending === action;
        return (
          <button
            key={action}
            type="button"
            disabled={pending !== null}
            onClick={() => pick(action, weight, status)}
            className={[
              "flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg px-2.5 py-3",
              "border border-black/8 bg-white hover:border-primary/30 hover:bg-primary/[0.03]",
              "transition-colors text-center",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              isPending ? "ring-2 ring-primary/40" : "",
            ].join(" ")}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
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
