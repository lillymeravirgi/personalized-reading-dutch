import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
} from "lucide-react";

import {
  getReadingSession,
  defineWord,
  logSession,
  logDwellTime,
  logWordLookup,
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

  // R8.1: select primitives, not object literals.
  const currentSession = useStore((s) => s.currentSession);
  const isLoading = useStore((s) => s.isLoadingSession);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setLoadingSession = useStore((s) => s.setLoadingSession);
  const clearSession = useStore((s) => s.clearSession);
  const interactions = useStore((s) => s.interactions);
  const user = useStore((s) => s.user);

  const [error, setError] = useState<string | null>(null);
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const [plainLookup, setPlainLookup] = useState<PlainLookup | null>(null);
  const { elapsedMs } = useReadingTimer(!!currentSession && !error);

  // Keep a ref of elapsedMs so the unmount cleanup can read the last value
  // without re-subscribing each tick.
  const elapsedRef = useRef(0);
  useEffect(() => { elapsedRef.current = elapsedMs; }, [elapsedMs]);

  // Click on a non-highlighted word: quick lookup only. It does not count
  // toward WEI and does not silently add words to the learner's deck.
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
      setPlainLookup({ word, english, loading: false, anchor });
    } catch {
      setPlainLookup({ word, english: null, loading: false, anchor });
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

  // Push the session into the user's activity log the first time it loads,
  // and persist the accumulated dwell time when leaving the page.
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

  const sessionInteractionCount = useMemo(
    () => interactions.filter((i) => i.sessionId === sessionId).length,
    [interactions, sessionId]
  );

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

  if (isLoading && !currentSession) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <div className="inline-flex items-center gap-2 text-text/60 font-body text-sm">
          <Sparkles size={16} className="animate-pulse" />
          Loading your reading…
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
      {/* Header */}
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
          <span>
            {sessionInteractionCount} / {currentSession.highlights.length} looked up
          </span>
        </div>
      </header>

      {/* Legend hint */}
      <div className="mb-4 text-xs text-text/50 font-body">
        Click any <span className="bg-yellow-100 text-yellow-900 px-1 rounded">yellow</span>{" "}
        or <span className="bg-blue-100 text-blue-900 px-1 rounded">blue</span>{" "}
        word to decide how to study it. Click any other word for a quick translation.
      </div>

      {/* Reading body */}
      <div className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-9 mb-6">
        <HighlightedText
          text={currentSession.text}
          highlights={currentSession.highlights}
          onHighlightClick={handleHighlightClick}
          onPlainWordClick={handlePlainWordClick}
          activeWordId={activeWordId}
          activePlainWord={plainLookup?.word ?? null}
        />
      </div>

      {/* Finish CTA */}
      <div className="flex flex-col items-end gap-2">
        <motion.button
          type="button"
          onClick={handleFinish}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-heading font-semibold text-white hover:opacity-90"
        >
          <CheckCircle2 size={16} strokeWidth={2.3} />
          Finish reading
        </motion.button>
        <p className="max-w-xs text-right text-xs font-body text-text/45">
          After this, please answer a short study survey.
        </p>
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
