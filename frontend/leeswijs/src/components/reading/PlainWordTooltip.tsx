import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Plus, Check } from "lucide-react";
import SpeakButton from "../SpeakButton";
import { addToLearn, isBackendNotReadyMessage } from "../../services/api";

export type PlainLookup = {
  word: string;
  english: string | null;
  loading: boolean;
  message?: string;
  anchor: { top: number; left: number; width: number; height: number };
};

type Props = {
  lookup: PlainLookup | null;
  onClose: () => void;
};

type AddState = "idle" | "saving" | "saved" | "error";

export default function PlainWordTooltip({ lookup, onClose }: Props) {
  const [addState, setAddState] = useState<AddState>("idle");
  const [addError, setAddError] = useState<string | null>(null);
  const visibleAddError = isBackendNotReadyMessage(addError)
    ? "Saving non-highlighted words needs backend support."
    : addError;

  useEffect(() => {
    if (!lookup) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup, onClose]);

  useEffect(() => {
    setAddState("idle");
    setAddError(null);
  }, [lookup?.word]);

  async function handleAdd() {
    if (!lookup || addState === "saving" || addState === "saved") return;
    setAddState("saving");
    setAddError(null);
    try {
      await addToLearn(lookup.word, lookup.english);
      setAddState("saved");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add this word.");
      setAddState("error");
    }
  }

  return (
    <AnimatePresence>
      {lookup && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={onClose}
          />
          <motion.div
            key={lookup.word + lookup.anchor.top + lookup.anchor.left}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "fixed",
              top: lookup.anchor.top + lookup.anchor.height + 8,
              left: Math.max(12, lookup.anchor.left - 8),
              maxWidth: "calc(100vw - 24px)",
            }}
            className="z-50 w-72 rounded-xl bg-white shadow-2xl shadow-black/20 border border-black/8 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
              <div>
                <p className="text-[10px] font-heading font-semibold uppercase tracking-wide text-text/40">
                  Dutch
                </p>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-lg font-bold text-text">
                    {lookup.word}
                  </h3>
                  <SpeakButton
                    text={lookup.word}
                    label={`Play pronunciation for ${lookup.word}`}
                    className="h-7 w-7 shrink-0"
                    size={13}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md hover:bg-black/5 text-text/40"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="px-4 pb-3.5 space-y-2">
              <div className="space-y-1">
                <p className="text-[10px] font-heading font-semibold uppercase tracking-wide text-text/40">
                  English
                </p>
                {lookup.loading ? (
                  <div className="flex items-center gap-1.5 text-sm text-text/50 font-body">
                    <Loader2 size={13} className="animate-spin" />
                    Looking it up…
                  </div>
                ) : lookup.english ? (
                  <p className="text-sm font-body text-primary font-semibold">
                    {lookup.english}
                  </p>
                ) : (
                  <p className="text-sm font-body text-text/45 italic">
                    {lookup.message ?? "Translation is not available yet."}
                  </p>
                )}
              </div>

              {!lookup.loading && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={addState === "saving" || addState === "saved"}
                    className={[
                      "w-full inline-flex items-center justify-center gap-1.5",
                      "rounded-lg px-3 py-1.5 text-xs font-heading font-semibold",
                      "transition-colors outline-none",
                      addState === "saved"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                        : addState === "saving"
                          ? "bg-primary/10 text-primary cursor-wait"
                          : addState === "error"
                            ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                            : "bg-primary text-white hover:opacity-90",
                    ].join(" ")}
                  >
                    {addState === "saving" && (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Saving…
                      </>
                    )}
                    {addState === "saved" && (
                      <>
                        <Check size={12} strokeWidth={2.6} />
                        Saved
                      </>
                    )}
                    {addState === "error" && (
                      <>
                        <Plus size={12} strokeWidth={2.6} />
                        Retry
                      </>
                    )}
                    {addState === "idle" && (
                      <>
                        <Plus size={12} strokeWidth={2.6} />
                        Save word
                      </>
                    )}
                  </button>
                  {addState === "error" && visibleAddError && (
                    <p className="mt-1 text-[11px] font-body text-red-600">
                      {visibleAddError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
