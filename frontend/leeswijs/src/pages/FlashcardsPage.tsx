import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Home, RotateCcw, Layers, Sparkles } from "lucide-react";

import { useStore } from "../store";
import { getFlashcards } from "../services/api";
import FlashcardDeck from "../components/flashcards/FlashcardDeck";

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const flashcards       = useStore((s) => s.flashcards);
  const isLoading        = useStore((s) => s.isLoadingFlashcards);
  const setFlashcards    = useStore((s) => s.setFlashcards);
  const setLoadingCards  = useStore((s) => s.setLoadingFlashcards);
  const resetSession     = useStore((s) => s.resetSession);

  const [complete,      setComplete]      = useState(false);
  const [rememberedIds, setRememberedIds] = useState<Set<string>>(new Set());

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    setLoadingCards(true);
    getFlashcards().then((res) => {
      if (cancelled) return;
      if (res.success) setFlashcards(res.data);
      setLoadingCards(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleComplete(remembered: Set<string>) {
    setRememberedIds(remembered);
    setComplete(true);
  }

  function handleReview() {
    resetSession();
    setRememberedIds(new Set());
    setComplete(false);
  }

  // Phase router
  return (
    <div className="max-w-2xl mx-auto">
      <Header />
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {isLoading && <LoadingView key="loading" />}
          {!isLoading && flashcards.length === 0 && (
            <EmptyView
              key="empty"
              onHome={() => navigate("/home")}
              onContinue={
                sessionId
                  ? () => navigate(`/vocab-test/${encodeURIComponent(sessionId)}`)
                  : undefined
              }
            />
          )}
          {!isLoading && flashcards.length > 0 && !complete && (
            <motion.div
              key="deck"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <FlashcardDeck onComplete={handleComplete} />
            </motion.div>
          )}
          {!isLoading && complete && (
            <CompleteView
              key="complete"
              remembered={rememberedIds.size}
              total={flashcards.length}
              onReview={handleReview}
              onHome={() => navigate("/home")}
              onContinue={
                sessionId
                  ? () => navigate(`/vocab-test/${encodeURIComponent(sessionId)}`)
                  : undefined
              }
            />
          )}
        </AnimatePresence>
      </div>

      {/* Session flag to remember this page mounted (defensive reset on unmount) */}
      <ResetOnLeave reset={resetSession} />
    </div>
  );
}

// Sub-views
function Header() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
        <Layers size={18} strokeWidth={2} />
      </div>
      <div>
        <h1 className="font-heading text-2xl font-bold text-text">Flashcards</h1>
        <p className="text-sm font-body text-text/50">
          Review the words you're learning.
        </p>
      </div>
    </div>
  );
}

function LoadingView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-6 py-12"
    >
      <div className="w-full max-w-lg aspect-[3/2] rounded-2xl bg-black/5 animate-pulse" />
      <div className="h-10 w-48 rounded-xl bg-black/5 animate-pulse" />
    </motion.div>
  );
}

function EmptyView({
  onHome,
  onContinue,
}: {
  onHome: () => void;
  onContinue?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center text-center py-16"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5">
        <Layers size={28} className="text-text/30" strokeWidth={1.6} />
      </div>
      <h2 className="font-heading text-xl font-bold text-text mb-2">
        No flashcards due
      </h2>
      <p className="text-sm font-body text-text/50 max-w-sm mb-6">
        Complete more reading tasks and mark highlighted words as "Add to learn"
        to build up your deck.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <motion.button
          type="button"
          onClick={onHome}
          whileTap={{ scale: 0.97 }}
          className="flex items-center justify-center gap-2 rounded-xl border border-black/12 bg-white px-5 py-2.5 text-sm font-heading font-semibold text-text hover:bg-black/[0.03]"
        >
          <Home size={14} />
          Back home
        </motion.button>
        {onContinue && (
          <motion.button
            type="button"
            onClick={onContinue}
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-heading font-semibold text-white hover:opacity-90"
          >
            Vocabulary Check
            <ArrowRight size={14} />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

function CompleteView({
  remembered,
  total,
  onReview,
  onHome,
  onContinue,
}: {
  remembered: number;
  total: number;
  onReview: () => void;
  onHome: () => void;
  onContinue?: () => void;
}) {
  const pct = total === 0 ? 0 : Math.round((remembered / total) * 100);
  const meta = verdict(pct);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10 flex flex-col items-center text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${meta.color}18` }}
      >
        <Sparkles size={30} style={{ color: meta.color }} strokeWidth={1.6} />
      </motion.div>

      <h2 className="font-heading text-2xl font-bold text-text mb-1">
        {meta.title}
      </h2>
      <p className="text-sm font-body text-text/50 max-w-sm mb-7">
        {meta.subtitle}
      </p>

      <div className="flex items-end gap-2 mb-1">
        <span
          className="font-heading text-5xl font-bold"
          style={{ color: meta.color }}
        >
          {remembered}
        </span>
        <span className="font-heading text-xl text-text/40 pb-1">
          / {total}
        </span>
      </div>
      <p className="text-xs font-body font-semibold text-text/50 uppercase tracking-wide mb-8">
        words remembered ({pct}%)
      </p>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        <motion.button
          type="button"
          onClick={onReview}
          whileTap={{ scale: 0.97 }}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-black/12 bg-white px-5 py-2.5 text-sm font-heading font-semibold text-text hover:bg-black/[0.03]"
        >
          <RotateCcw size={14} />
          Study Again
        </motion.button>
        <motion.button
          type="button"
          onClick={onContinue ?? onHome}
          whileTap={{ scale: 0.97 }}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-heading font-semibold text-white hover:opacity-90"
        >
          {onContinue ? (
            <>
              Vocabulary Check
              <ArrowRight size={14} />
            </>
          ) : (
            <>
              <Home size={14} />
              Back home
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

function verdict(pct: number) {
  if (pct >= 80) return { title: "Excellent!",   subtitle: "You've got a strong grip on these words.",       color: "#0D7377" };
  if (pct >= 50) return { title: "Nice work.",   subtitle: "A solid run — keep reviewing to lock them in.", color: "#F2A541" };
  return         { title: "Good try.",          subtitle: "Fresh words take time. Another pass will help.", color: "#EF4444" };
}

// Reset the deck state when navigating away so a second visit starts clean.
function ResetOnLeave({ reset }: { reset: () => void }) {
  useEffect(() => {
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
