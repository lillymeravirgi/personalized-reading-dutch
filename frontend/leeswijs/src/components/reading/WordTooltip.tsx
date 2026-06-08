import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Check, Loader2, RotateCcw, X } from "lucide-react";
import SpeakButton from "../SpeakButton";

export type TooltipWord = {
  word: string;
  english: string | null;
  loading: boolean;
  message?: string;
  anchor: { top: number; left: number; width: number; height: number };
  wordId?: string;
  status?: "new" | "learning" | "known" | null; 
  cefrLevel?: string;
};

type Props = {
  lookup: TooltipWord | null;
  onClose: () => void;
  onOpenDetail: () => void;
  onMarkKnown: () => void;
  markingKnown?: boolean;
  readOnly?: boolean;
};

export default function WordTooltip({
  lookup,
  onClose,
  onOpenDetail,
  onMarkKnown,
  markingKnown,
  readOnly,
}: Props) {
  useEffect(() => {
    if (!lookup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lookup, onClose]);

  const isYellow = lookup?.status === "learning";
  const showActions = !!lookup && !lookup.loading && !!lookup.wordId && !readOnly;
  const tooltipPosition = lookup ? tooltipStyle(lookup.anchor, 240) : undefined;

  return (
    <AnimatePresence>
      {lookup && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />

          <motion.div
            key={lookup.word + String(lookup.anchor.top) + String(lookup.anchor.left)}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            style={{
              position: "fixed",
              ...tooltipPosition,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "calc(100vh - 24px)",
            }}
            className="z-50 w-72 overflow-y-auto rounded-xl bg-white shadow-2xl shadow-black/20 border border-black/8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {lookup.status === "new" && (
                    <span className="text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">New</span>
                  )}
                  {lookup.status === "learning" && (
                    <span className="text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Learning</span>
                  )}
                  {lookup.status === "known" && (
                    <span className="text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Known</span>
                  )}
                  {lookup.cefrLevel && (
                    <span className="text-[9px] font-heading font-semibold uppercase tracking-wider text-text/35">{lookup.cefrLevel}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-heading text-lg font-bold text-text truncate">{lookup.word}</h3>
                  <SpeakButton text={lookup.word} label={`Pronounce ${lookup.word}`} className="h-7 w-7 shrink-0" size={13} />
                </div>
              </div>
              <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-black/5 text-text/40 shrink-0" aria-label="Close">
                <X size={14} />
              </button>
            </div>

            <div className="px-4 pb-3">
              <p className="text-[10px] font-heading font-semibold uppercase tracking-wide text-text/40 mb-0.5">English</p>
              {lookup.loading ? (
                <div className="flex items-center gap-1.5 text-sm text-text/50 font-body">
                  <Loader2 size={13} className="animate-spin" /> Looking it up…
                </div>
              ) : lookup.english ? (
                <p className="text-sm font-body text-primary font-semibold">{lookup.english}</p>
              ) : (
                <p className="text-sm font-body text-text/45 italic">{lookup.message ?? "Translation not available."}</p>
              )}
            </div>

            {showActions && (
              <div className="border-t border-black/6 px-3 py-2.5 flex gap-2">
                {!isYellow && (
                  <button
                    type="button"
                    disabled={markingKnown}
                    onClick={onMarkKnown}
                    className="flex items-center gap-1.5 rounded-lg border border-black/8 bg-white px-3 py-2 text-xs font-heading font-semibold text-text/70 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-50 flex-1"
                  >
                    <Check size={13} /> {markingKnown ? "Saving…" : "I know it"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={onOpenDetail}
                  className={[
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-heading font-semibold transition-colors flex-1",
                    isYellow
                      ? "border border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
                      : "bg-primary text-white hover:opacity-90",
                  ].join(" ")}
                >
                  {isYellow ? <RotateCcw size={13} /> : <BookOpen size={13} />}
                  {isYellow ? "Review it" : "Learn it"}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function tooltipStyle(
  anchor: TooltipWord["anchor"],
  estimatedHeight: number,
): { top: number; left: number } {
  const margin = 12;
  const width = Math.min(288, window.innerWidth - margin * 2);
  const below = anchor.top + anchor.height + 8;
  const above = anchor.top - estimatedHeight - 8;
  const top = below + estimatedHeight <= window.innerHeight - margin
    ? below
    : Math.max(margin, above);
  const left = Math.max(margin, Math.min(anchor.left - 8, window.innerWidth - width - margin));
  return { top, left };
}
