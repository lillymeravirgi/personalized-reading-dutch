import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import SpeakButton from "../SpeakButton";

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

export default function PlainWordTooltip({ lookup, onClose }: Props) {

  useEffect(() => {
    if (!lookup) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup, onClose]);

  useEffect(() => {
    // idle logic removed
  }, [lookup?.word]);

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

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
