import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BookOpenText, CheckCircle2, X } from "lucide-react";
import type { HighlightedWord } from "../../types";
import type { InteractionAction } from "../../types";
import IntentChoice from "./IntentChoice";
import SpeakButton from "../SpeakButton";

type Props = {
  sessionId: string;
  word: HighlightedWord | null;
  onClose: () => void;
};

export default function WordModal({ sessionId, word, onClose }: Props) {
  const [showExamples, setShowExamples] = useState(false);
  const [feedback, setFeedback] = useState<"learn" | null>(null);

  useEffect(() => {
    if (!word) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [word, onClose]);

  useEffect(() => {
    setShowExamples(false);
    setFeedback(null);
  }, [word?.wordId]);

  function handleLogged(action: InteractionAction) {
    if (action === "see_examples") {
      setShowExamples(true);
      return;
    }
    if (action === "add_to_learn") {
      setFeedback("learn");
      return;
    }
    onClose();
  }

  return (
    <AnimatePresence>
      {word && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl shadow-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={[
                      "text-[10px] font-heading font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide",
                      word.highlightType === "unknown"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-yellow-100 text-yellow-800",
                    ].join(" ")}
                  >
                    {word.highlightType === "unknown" ? "New" : "Learning"}
                  </span>
                  <span className="text-[10px] font-semibold text-text/40 uppercase tracking-wide">
                    {word.usageFrequency}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-3xl font-bold leading-tight text-text">
                    {word.dutch}
                  </h2>
                  <SpeakButton
                    text={word.dutch}
                    label={`Play pronunciation for ${word.dutch}`}
                    className="h-9 w-9 shrink-0"
                  />
                </div>
                <p className="mt-1 text-base text-text/55 font-body">
                  {word.english}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-text/45 hover:bg-black/5"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {showExamples && word.exampleSentences.length > 0 && (
              <div className="border-y border-black/6 bg-black/[0.015] px-5 py-4">
                <h3 className="mb-3 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wide text-text/50">
                  <BookOpenText size={14} />
                  In context
                </h3>
                <ul className="space-y-3.5">
                  {word.exampleSentences.map((s, i) => (
                    <li key={i} className="border-l-2 border-primary/25 pl-3 leading-relaxed">
                      <p className="text-[15px] font-body italic text-text/85">
                        &ldquo;{s.nl}&rdquo;
                      </p>
                      <p className="mt-1 text-[13px] font-body text-text/50">
                        {s.en}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-black/6 px-5 py-4">
              {feedback === "learn" ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-primary/15 bg-primary/[0.04] px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CheckCircle2 size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-heading text-sm font-semibold text-text">
                        Saved for review
                      </h3>
                      <p className="mt-0.5 text-xs font-body leading-relaxed text-text/55">
                        This word will appear in the flashcard step after the reading.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-heading font-semibold text-white hover:opacity-90"
                  >
                    Continue reading
                    <ArrowRight size={13} />
                  </button>
                </motion.div>
              ) : (
                <>
                  <h3 className="mb-2 font-heading text-xs font-semibold uppercase tracking-wide text-text/50">
                    Your choice
                  </h3>
                  <IntentChoice
                    sessionId={sessionId}
                    wordId={word.wordId}
                    hideContext={showExamples || word.exampleSentences.length === 0}
                    hideAddToLearn={word.highlightType === "learning"}
                    onLogged={handleLogged}
                  />
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
