import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  BookPlus,
  Loader2,
} from "lucide-react";

import {
  getReadingSession,
  defineWord,
  isBackendNotReadyMessage,
  logSession,
  logDwellTime,
  logWordLookup,
  continueSession,
} from "../services/api";
import { useStore } from "../store";
import { useReadingTimer } from "../hooks/useReadingTimer";
import HighlightedText from "../components/reading/HighlightedText";
import WordModal from "../components/reading/WordModal";
import PlainWordTooltip, {
  type PlainLookup,
} from "../components/reading/PlainWordTooltip";
import type { HighlightedWord } from "../types";

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ReadingPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const currentSession = useStore((s) => s.currentSession);
  const isLoading = useStore((s) => s.isLoadingSession);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setLoadingSession = useStore((s) => s.setLoadingSession);
  const clearSession = useStore((s) => s.clearSession);
  const user = useStore((s) => s.user);

  const [error, setError] = useState<string | null>(null);
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const [plainLookup, setPlainLookup] = useState<PlainLookup | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);
  const { elapsedMs } = useReadingTimer(!!currentSession && !error);

  const elapsedRef = useRef(0);
  useEffect(() => { elapsedRef.current = elapsedMs; }, [elapsedMs]);

  async function handlePlainWordClick(word: string, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const anchor = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
    if (user) logWordLookup(user.id);
    setPlainLookup({ word, english: null, loading: true, anchor });
    try {
      const english = await defineWord(word);
      setPlainLookup({
        word,
        english,
        loading: false,
        anchor,
        message: english ? undefined : "Translation is not available yet.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setPlainLookup({
        word,
        english: null,
        loading: false,
        anchor,
        message: isBackendNotReadyMessage(message)
          ? "Translation for non-highlighted words needs backend support."
          : "Translation is not available yet.",
      });
    }
  }

  function handleHighlightClick(wordId: string) {
    if (user) logWordLookup(user.id);
    setActiveWordId(wordId);
  }

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoadingSession(true);
    setError(null);
    getReadingSession(sessionId, user?.id)
      .then((res) => {
        if (cancelled) return;
        if (res.success) setCurrentSession(res.data);
        else setError(res.error ?? "Could not load this session.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load this session.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, setCurrentSession, setLoadingSession, user?.id]);

  useEffect(() => {
    return () => {
      clearSession();
    };
  }, [clearSession]);

  useEffect(() => {
    if (!user || !currentSession) return;
    logSession(user.id, {
      sessionId: currentSession.sessionId,
      title: currentSession.title,
      topic: currentSession.topic,
      cefrLevel: currentSession.cefrLevel,
      isAdaptive: currentSession.isAdaptive,
      createdAt: new Date().toISOString(),
    });
    const uid = user.id;
    const sid = currentSession.sessionId;
    return () => {
      logDwellTime(uid, sid, elapsedRef.current);
    };
  }, [user, currentSession]);

  const activeWord: HighlightedWord | null = useMemo(() => {
    if (!currentSession || !activeWordId) return null;
    return (
      currentSession.highlights.find((h) => h.wordId === activeWordId) ?? null
    );
  }, [currentSession, activeWordId]);

  function handleFinish() {
    if (!sessionId) return;
    navigate(`/survey/${encodeURIComponent(sessionId)}`);
  }

  async function handleContinue() {
    if (!sessionId || !user || continuing) return;
    setContinuing(true);
    setContinueError(null);
    try {
      const { sessionId: nextId } = await continueSession(user.id, sessionId);
      logDwellTime(user.id, sessionId, elapsedRef.current);
      navigate(`/read/${encodeURIComponent(nextId)}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not continue this reading.";
      setContinueError(
        isBackendNotReadyMessage(message)
          ? "Continue reading needs backend support. Please finish this reading."
          : message
      );
      setContinuing(false);
    }
  }

  if (isLoading && !currentSession) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <div className="inline-flex items-center gap-2 text-text/60 font-body text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <div className="flex items-start gap-3 rounded-2xl bg-red-50 border border-red-200 px-5 py-4">
          <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-heading font-semibold text-red-700">
              Couldn't load the session
            </h2>
            <p className="text-sm text-red-700/80 font-body mt-0.5">{error}</p>
            <button
              type="button"
              onClick={() => navigate("/home")}
              className="mt-3 text-sm font-heading font-semibold text-red-700 underline"
            >
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentSession) return null;

  const blueCount = currentSession.highlights.filter(
    (h) => h.highlightType === "unknown"
  ).length;
  const yellowCount = currentSession.highlights.filter(
    (h) => h.highlightType === "learning"
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-3xl mx-auto"
    >
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-white uppercase tracking-wide">
            {currentSession.cefrLevel}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wide">
            {currentSession.topic}
          </span>
        </div>
        <h1 className="font-heading text-3xl font-bold text-text">
          {currentSession.title}
        </h1>
        <div className="mt-3 flex items-center gap-4 text-xs text-text/50 font-body">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} /> {formatElapsed(elapsedMs)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-blue-300" />
            {blueCount} new
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-yellow-300" />
            {yellowCount} learning
          </span>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-body text-text/50">
        <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-900">
          New words
        </span>
        <span className="rounded-full bg-yellow-100 px-2.5 py-1 font-semibold text-yellow-900">
          Learning words
        </span>
      </div>


      <div className="mb-6 rounded-lg border border-black/8 bg-white px-6 py-7 shadow-sm shadow-black/5 sm:px-8 sm:py-9">
        <HighlightedText
          text={currentSession.text}
          highlights={currentSession.highlights}
          onHighlightClick={handleHighlightClick}
          onPlainWordClick={handlePlainWordClick}
          activeWordId={activeWordId}
          activePlainWord={plainLookup?.word ?? null}
        />
      </div>

      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <motion.button
            type="button"
            onClick={handleContinue}
            disabled={continuing}
            whileTap={{ scale: continuing ? 1 : 0.97 }}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-5 py-2.5",
              "text-sm font-heading font-semibold",
              "border border-primary/40 text-primary bg-white",
              "transition-colors",
              continuing
                ? "opacity-60 cursor-wait"
                : "hover:bg-primary/[0.06]",
            ].join(" ")}
          >
            {continuing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Continuing
              </>
            ) : (
              <>
                <BookPlus size={16} strokeWidth={2.3} />
                Continue reading
              </>
            )}
          </motion.button>
          <motion.button
            type="button"
            onClick={handleFinish}
            disabled={continuing}
            whileTap={{ scale: continuing ? 1 : 0.97 }}
            className={[
              "inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5",
              "text-sm font-heading font-semibold text-white",
              continuing ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
            ].join(" ")}
          >
            <CheckCircle2 size={16} strokeWidth={2.3} />
            Finish reading
          </motion.button>
        </div>
        {continueError ? (
          <p className="max-w-xs text-right text-xs font-body text-red-600">
            {continueError}
          </p>
        ) : (
          <p className="text-right text-xs font-body text-text/45 sm:whitespace-nowrap">
            Read more on this topic, or finish when ready.
          </p>
        )}
      </div>

      <WordModal
        sessionId={currentSession.sessionId}
        word={activeWord}
        onClose={() => setActiveWordId(null)}
      />

      <PlainWordTooltip
        lookup={plainLookup}
        onClose={() => setPlainLookup(null)}
      />
    </motion.div>
  );
}
