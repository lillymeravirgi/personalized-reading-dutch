import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpenText, X } from "lucide-react";
import type { HighlightedWord } from "../../types";
import IntentChoice from "./IntentChoice";
import SpeakButton from "../SpeakButton";

type Props = {
  sessionId: string;
  word: HighlightedWord | null;
  onClose: () => void;
};

export default function WordModal({ sessionId, word, onClose }: Props) {
  const [showExamples, setShowExamples] = useState(false);

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
  }, [word?.wordId]);

  return (
    <AnimatePresence>
      {word && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-[#fbfaf7] shadow-2xl shadow-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5">
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

            {/* Examples */}
            {showExamples && word.exampleSentences.length > 0 && (
              <div className="border-y border-black/6 bg-white px-6 py-4">
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

            {/* Intent */}
            <div className="px-6 py-5">
              <h3 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wide text-text/50">
                Study choice
              </h3>
              <IntentChoice
                sessionId={sessionId}
                wordId={word.wordId}
                hideContext={showExamples || word.exampleSentences.length === 0}
                onLogged={(action) => {
                  if (action === "see_examples") {
                    setShowExamples(true);
                    return;
                  }
                  onClose();
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
