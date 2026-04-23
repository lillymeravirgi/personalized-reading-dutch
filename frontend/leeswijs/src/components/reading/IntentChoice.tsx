import { useState } from "react";
import { BookOpen, Plus, X } from "lucide-react";
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
  onLogged: (action: InteractionAction) => void;
};

// Weights must match the backend IntentTagType.
const CHOICES: {
  action: InteractionAction;
  weight: InteractionWeight;
  label: string;
  hint: string;
  icon: typeof BookOpen;
  // If picked, how should we mutate the local word status?
  status?: WordStatus;
}[] = [
  {
    action: "see_examples",
    weight: 5,
    label: "See examples",
    hint: "Show this word in context",
    icon: BookOpen,
  },
  {
    action: "add_to_learn",
    weight: 2,
    label: "Add to Learn List",
    hint: "I want to study this",
    icon: Plus,
    status: "learning",
  },
  {
    action: "ignore",
    weight: 1,
    label: "Ignore",
    hint: "Skip this one",
    icon: X,
  },
];

export default function IntentChoice({ sessionId, wordId, onLogged }: Props) {
  const [pending, setPending] = useState<InteractionAction | null>(null);
  const addInteraction = useStore((s) => s.addInteraction);
  const updateWordStatus = useStore((s) => s.updateWordStatus);
  const incrementExposure = useStore((s) => s.incrementExposure);

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
    <div className="flex flex-col gap-2">
      {CHOICES.map(({ action, weight, label, hint, icon: Icon, status }) => {
        const isPending = pending === action;
        return (
          <button
            key={action}
            type="button"
            disabled={pending !== null}
            onClick={() => pick(action, weight, status)}
            className={[
              "flex items-center gap-3 w-full rounded-xl px-4 py-3",
              "border border-black/5 bg-white hover:bg-primary/5",
              "transition-colors text-left",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              isPending ? "ring-2 ring-primary/40" : "",
            ].join(" ")}
          >
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Icon size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-heading text-sm font-semibold text-text">
                {label}
              </div>
              <div className="text-xs text-text/50 font-body">{hint}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
