import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, ClipboardCheck, Home, RotateCcw, Layers } from "lucide-react";

import { useStore } from "../store";
import {
  getFlashcards,
  isBackendNotReadyMessage,
  readActivity,
} from "../services/api";
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
  const user             = useStore((s) => s.user);
  const currentSession   = useStore((s) => s.currentSession);
  const latestSession = user ? readActivity(user.id).sessions.slice(-1)[0] : null;
  const effectiveSessionId = sessionId ?? currentSession?.sessionId ?? latestSession?.sessionId ?? null;

  const [complete,      setComplete]      = useState(false);
  const [rememberedIds, setRememberedIds] = useState<Set<string>>(new Set());
  const [error,         setError]         = useState<string | null>(null);
  const [reloadId,      setReloadId]      = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadingCards(true);
    setError(null);
    getFlashcards(effectiveSessionId, user?.id)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setFlashcards(res.data);
        } else {
          setFlashcards([]);
          setError(res.error);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFlashcards([]);
        setError(err instanceof Error ? err.message : "Could not load flashcards.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCards(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveSessionId, reloadId, setFlashcards, setLoadingCards, user?.id]);

  function handleComplete(remembered: Set<string>) {
    setRememberedIds(remembered);
    setComplete(true);
  }

  function handleReview() {
    resetSession();
    setRememberedIds(new Set());
    setComplete(false);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Header />
      <div className="mt-6">
        <AnimatePresence mode="wait">
          {isLoading && <LoadingView key="loading" />}
          {!isLoading && error && (
            <ErrorView
              key="error"
              message={error}
              onRetry={() => setReloadId((n) => n + 1)}
              onHome={() => navigate("/home")}
            />
          )}
          {!isLoading && !error && flashcards.length === 0 && (
            <EmptyView
              key="empty"
              onHome={() => navigate("/home")}
              onVocabTest={
                effectiveSessionId
                  ? () => navigate(`/vocab-test/${encodeURIComponent(effectiveSessionId)}`)
                  : undefined
              }
            />
          )}
          {!isLoading && !error && flashcards.length > 0 && !complete && (
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
          {!isLoading && !error && complete && (
            <CompleteView
              key="complete"
              remembered={rememberedIds.size}
              total={flashcards.length}
              onReview={handleReview}
              onHome={() => navigate("/home")}
              onContinue={
                effectiveSessionId
                  ? () => navigate(`/vocab-test/${encodeURIComponent(effectiveSessionId)}`)
                  : undefined
              }
            />
          )}
        </AnimatePresence>
      </div>

      <ResetOnLeave reset={resetSession} />
    </div>
  );
}

function Header() {
  return (
    <div className="rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers size={18} strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-text">Flashcards</h1>
            <p className="text-sm font-body text-text/50">
              Review selected words before the vocabulary check.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/[0.06] px-3 py-1.5 text-xs font-body font-semibold text-primary">
          <ClipboardCheck size={13} />
          Vocabulary check next
        </div>
      </div>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
  onHome,
}: {
  message: string;
  onRetry: () => void;
  onHome: () => void;
}) {
  const backendNotReady = isBackendNotReadyMessage(message);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={[
        "rounded-lg border px-5 py-4",
        backendNotReady ? "border-black/8 bg-white" : "border-red-200 bg-red-50",
      ].join(" ")}
    >
      <div className="flex gap-3">
        <AlertCircle
          size={18}
          className={[
            "mt-0.5 shrink-0",
            backendNotReady ? "text-text/35" : "text-red-500",
          ].join(" ")}
        />
        <div>
          <h2
            className={[
              "font-heading text-sm font-semibold",
              backendNotReady ? "text-text" : "text-red-700",
            ].join(" ")}
          >
            {backendNotReady ? "Flashcards are not connected yet" : "Could not load flashcards"}
          </h2>
          <p
            className={[
              "mt-1 text-sm font-body",
              backendNotReady ? "text-text/55" : "text-red-700/80",
            ].join(" ")}
          >
            {backendNotReady
              ? "This review step is waiting for backend support. You can go back and start another reading for now."
              : message}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!backendNotReady && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-heading font-semibold text-white hover:opacity-90"
              >
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={onHome}
              className={[
                "rounded-lg border bg-white px-3 py-2 text-xs font-heading font-semibold",
                backendNotReady
                  ? "border-black/12 text-text/70 hover:bg-black/[0.03]"
                  : "border-red-200 text-red-700 hover:bg-red-100",
              ].join(" ")}
            >
              Back home
            </button>
          </div>
        </div>
      </div>
    </motion.div>
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
  onVocabTest,
}: {
  onHome: () => void;
  onVocabTest?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center rounded-lg border border-black/8 bg-white px-6 py-14 text-center shadow-sm shadow-black/5"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5">
        <Layers size={28} className="text-text/30" strokeWidth={1.6} />
      </div>
      <h2 className="font-heading text-xl font-bold text-text mb-2">
        No flashcards due
      </h2>
      <p className="text-sm font-body text-text/50 max-w-sm mb-6">
        There are no saved words to review from this deck.
      </p>
      <div className="flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        {onVocabTest && (
          <motion.button
            type="button"
            onClick={onVocabTest}
            whileTap={{ scale: 0.97 }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-heading font-semibold text-white hover:opacity-90"
          >
            Vocabulary check
            <ArrowRight size={14} />
          </motion.button>
        )}
        <motion.button
          type="button"
          onClick={onHome}
          whileTap={{ scale: 0.97 }}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-black/12 bg-white px-5 py-2.5 text-sm font-heading font-semibold text-text hover:bg-black/[0.03]"
        >
          <Home size={14} />
          Back home
        </motion.button>
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
      className="flex flex-col items-center rounded-lg border border-black/8 bg-white px-8 py-10 text-center shadow-sm shadow-black/5"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${meta.color}18` }}
      >
        <Layers size={30} style={{ color: meta.color }} strokeWidth={1.6} />
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
              Vocabulary check
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
  if (pct >= 80) return { title: "Review complete", subtitle: "Most words were remembered.", color: "#0D7377" };
  if (pct >= 50) return { title: "Review complete", subtitle: "Some words need another review.", color: "#F2A541" };
  return         { title: "Review complete", subtitle: "These words need more practice.", color: "#EF4444" };
}

function ResetOnLeave({ reset }: { reset: () => void }) {
  useEffect(() => {
    return () => reset();
  }, [reset]);
  return null;
}
