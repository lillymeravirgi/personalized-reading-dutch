import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";

import { useStore } from "../../store";
import { logFlashcardReview, submitFlashcardReview } from "../../services/api";
import FlashcardItem from "./FlashcardItem";

type Props = {
  onComplete: (remembered: Set<string>) => void;
};

export default function FlashcardDeck({ onComplete }: Props) {
  const flashcards  = useStore((s) => s.flashcards);
  const currentIdx  = useStore((s) => s.currentIndex);
  const reviewedIds = useStore((s) => s.reviewedIds);
  const markReviewed = useStore((s) => s.markReviewed);
  const user = useStore((s) => s.user);

  const [flipped,     setFlipped]     = useState(false);
  const [remembered,  setRemembered]  = useState<Set<string>>(new Set());

  const card  = flashcards[currentIdx];
  const total = flashcards.length;
  const done  = reviewedIds.size;

  const handleRate = useCallback((didRemember: boolean) => {
    if (!card) return;
    if (didRemember) {
      setRemembered((prev) => {
        const next = new Set(prev);
        next.add(card.wordId);
        return next;
      });
    }
    if (user) logFlashcardReview(user.id, didRemember);
    if (user) {
      void submitFlashcardReview(user.id, card.wordId, didRemember);
    }
    markReviewed(card.wordId);
    setFlipped(false);

    if (reviewedIds.size + 1 >= total) {
      const finalSet = didRemember
        ? new Set([...remembered, card.wordId])
        : remembered;
      onComplete(finalSet);
    }
  }, [card, markReviewed, onComplete, remembered, reviewedIds.size, total, user]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === " ") {
        e.preventDefault();
        setFlipped((v) => !v);
      } else if (flipped && e.key === "ArrowLeft") {
        e.preventDefault();
        handleRate(false);
      } else if (flipped && e.key === "ArrowRight") {
        e.preventDefault();
        handleRate(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, handleRate]);

  if (!card) return null;

  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto">
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-body font-semibold text-text/60 uppercase tracking-wide">
            Progress
          </span>
          <span className="text-xs font-body text-text/50">
            {done} / {total}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-black/8 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      <FlashcardItem
        key={card.wordId}
        card={card}
        flipped={flipped}
        onFlip={() => setFlipped(true)}
        onRate={handleRate}
      />
    </div>
  );
}
