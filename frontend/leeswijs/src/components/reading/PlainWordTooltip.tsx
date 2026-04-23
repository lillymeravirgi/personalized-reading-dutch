import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2, BookPlus } from "lucide-react";

export type PlainLookup = {
  word: string;
  english: string | null;
  loading: boolean;
  added: boolean;
  // Position of the clicked word, used to place the tooltip.
  anchor: { top: number; left: number; width: number; height: number };
};

type Props = {
  lookup: PlainLookup | null;
  onClose: () => void;
};

// Small popup shown when the user clicks a non-highlighted word.
// Click also auto-adds the word to flashcards (see ReadingPage).
// We do not log WEI here — WEI is only for highlighted words.
export default function PlainWordTooltip({ lookup, onClose }: Props) {
  useEffect(() => {
    if (!lookup) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup, onClose]);

  return (
    <AnimatePresence>
      {lookup && (
        <>
          {/* click-away catcher */}
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
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
              <div>
                <p className="text-[10px] font-heading font-semibold uppercase tracking-wide text-text/40">
                  Dutch
                </p>
                <h3 className="font-heading text-lg font-bold text-text">
                  {lookup.word}
                </h3>
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

            {/* Body */}
            <div className="px-4 pb-3.5 space-y-1">
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
                  Not in the demo dictionary.
                </p>
              )}
            </div>

            {/* Footer: auto-add status */}
            <div
              className={[
                "flex items-center gap-1.5 px-4 py-2 text-xs font-body border-t",
                lookup.added
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                  : "bg-black/[0.02] border-black/6 text-text/50",
              ].join(" ")}
            >
              {lookup.added ? (
                <>
                  <Check size={12} strokeWidth={3} />
                  <span className="font-semibold">
                    Added to your flashcards
                  </span>
                </>
              ) : (
                <>
                  <BookPlus size={12} />
                  <span>Saving to flashcards…</span>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
