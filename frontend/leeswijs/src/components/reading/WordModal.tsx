import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpenText, X, Clock } from "lucide-react";
import type { HighlightedWord } from "../../types";
import SpeakButton from "../SpeakButton";
import { addDiscoveredToLearn, submitFlashcardReview } from "../../services/api";
import { useStore } from "../../store";

type ReviewInterval = 0 | 1 | 2 | 4 | 7 | 30;
const INTERVALS: { label: string; days: ReviewInterval }[] = [
  { label: "Today",   days: 0  },
  { label: "1 day",  days: 1  },
  { label: "2 days", days: 2  },
  { label: "4 days", days: 4  },
  { label: "1 week", days: 7  },
  { label: "1 month",days: 30 },
];

type Props = {
  word: HighlightedWord | null;
  onClose: () => void;
  onWordStatusChange?: (wordId: string, newStatus: "known" | "learning") => void;
};

export default function WordModal({ word, onClose, onWordStatusChange }: Props) {
  const user = useStore((s) => s.user);
  const [saving, setSaving] = useState(false);

  // ESC to close
  useEffect(() => {
    if (!word) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [word, onClose]);

  if (!word) return null;

  const isNew    = word.highlightType === "unknown";

  async function handleSelectInterval(days: ReviewInterval) {
    if (!user || saving) return;
    setSaving(true);
    try {
      if (!isNew) {
        // Already learning -> submit review
        await submitFlashcardReview(user.id, word!.wordId, true, days);
      } else {
        // New word -> add to learn
        await addDiscoveredToLearn(user.id, word!.wordId, days);
      }
      onWordStatusChange?.(word!.wordId, "learning");
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/30 px-4 pb-4 sm:pb-0"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/20 flex flex-col"
          style={{ maxHeight: "calc(100vh - 32px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 shrink-0">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={[
                    "text-[10px] font-heading font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide",
                    isNew ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-800",
                  ].join(" ")}
                >
                  {isNew ? "New word" : "Learning"}
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
                  label={`Pronunciation: ${word.dutch}`}
                  className="h-9 w-9 shrink-0"
                />
              </div>
              <p className="mt-1 text-base text-text/55 font-body">{word.english}</p>
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

          {/* ── Body: Examples ──────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-black/[0.015] border-y border-black/6">
            <div className="px-5 py-4">
              <h3 className="mb-3 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wide text-text/50">
                <BookOpenText size={14} /> In context
              </h3>
              {word.exampleSentences.length > 0 ? (
                <ul className="space-y-4">
                  {word.exampleSentences.slice(0, 3).map((s, i) => (
                    <li key={i} className="border-l-2 border-primary/25 pl-3">
                      <p className="text-[15px] font-body italic text-text/85">&ldquo;{s.nl}&rdquo;</p>
                      <p className="mt-1 text-[13px] font-body text-text/50">{s.en}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-body text-text/40 italic">No examples available.</p>
              )}
            </div>
          </div>

          {/* ── Footer: One-Click Auto Save ─────────────────────── */}
          <div className="px-5 py-4 shrink-0 bg-white">
            <h3 className="mb-3 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wide text-text/50">
              <Clock size={14} /> When to review?
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {INTERVALS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  disabled={saving}
                  onClick={() => handleSelectInterval(opt.days)}
                  className="rounded-lg border border-black/8 bg-white py-2.5 text-sm font-heading font-semibold text-text hover:border-primary/40 hover:bg-primary/[0.04] transition-colors disabled:opacity-50"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
