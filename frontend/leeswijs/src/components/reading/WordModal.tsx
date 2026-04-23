import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { HighlightedWord } from "../../types";
import IntentChoice from "./IntentChoice";

type Props = {
  sessionId: string;
  word: HighlightedWord | null;
  onClose: () => void;
};

export default function WordModal({ sessionId, word, onClose }: Props) {
  useEffect(() => {
    if (!word) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [word, onClose]);

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
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/20 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-black/5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={[
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
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
                <h2 className="font-heading text-2xl font-bold text-text">
                  {word.dutch}
                </h2>
                <p className="text-sm text-text/60 font-body mt-0.5">
                  {word.english}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-black/5 text-text/50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Examples */}
            {word.exampleSentences.length > 0 && (
              <div className="px-6 py-4 border-b border-black/5">
                <h3 className="font-heading text-xs font-semibold text-text/50 uppercase tracking-wide mb-2">
                  Examples
                </h3>
                <ul className="space-y-3">
                  {word.exampleSentences.map((s, i) => (
                    <li key={i} className="leading-relaxed">
                      <p className="text-sm font-body text-text/85 italic">
                        &ldquo;{s.nl}&rdquo;
                      </p>
                      <p className="text-[13px] font-body text-text/55 mt-0.5">
                        {s.en}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Intent */}
            <div className="px-6 py-5 bg-black/[0.02]">
              <h3 className="font-heading text-xs font-semibold text-text/50 uppercase tracking-wide mb-3">
                What do you want to do?
              </h3>
              <IntentChoice
                sessionId={sessionId}
                wordId={word.wordId}
                onLogged={() => onClose()}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
