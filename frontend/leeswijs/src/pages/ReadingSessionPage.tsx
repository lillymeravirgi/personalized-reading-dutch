/**
 * ReadingSessionPage — displays and interacts with a specific reading session.
 * Accessed at /read/:sessionId
 *
 * Word-click flow:
 *   1st click → WordTooltip (small popup, translation + quick actions)
 *   "Learn it" / "Review it" → WordModal (big detail view with SRS picker)
 *   "I know it" → instant mark-known API call, word turns white immediately
 */
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
  markKnownFlashcard,
  continueSession,
} from "../services/api";
import { useStore } from "../store";
import { useReadingTimer } from "../hooks/useReadingTimer";
import HighlightedText from "../components/reading/HighlightedText";
import WordModal from "../components/reading/WordModal";
import WordTooltip, { type TooltipWord } from "../components/reading/WordTooltip";
import type { HighlightedWord } from "../types";

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ReadingSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const currentSession    = useStore((s) => s.currentSession);
  const isLoading         = useStore((s) => s.isLoadingSession);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setLoadingSession = useStore((s) => s.setLoadingSession);
  const clearSession      = useStore((s) => s.clearSession);
  const user              = useStore((s) => s.user);

  const [error,         setError]         = useState<string | null>(null);
  const [continuing,    setContinuing]    = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  // ── Tooltip state (small popup — first contact for ALL words) ──────────────
  const [tooltip,      setTooltip]      = useState<TooltipWord | null>(null);
  const [markingKnown, setMarkingKnown] = useState(false);
  // Local override: word IDs the user marked "known" this session (turn white immediately)
  const [knownOverride, setKnownOverride] = useState<Set<string>>(new Set());

  // ── Big Modal state (detail view — only after "Learn it" / "Review it") ───
  const [modalWordId, setModalWordId] = useState<string | null>(null);
  // Store LexiconEntries for white words defined on-the-fly
  const [definedEntries, setDefinedEntries] = useState<Record<string, any>>({});

  const { elapsedMs } = useReadingTimer(!!currentSession && !error);
  const elapsedRef = useRef(0);
  useEffect(() => { elapsedRef.current = elapsedMs; }, [elapsedMs]);

  // ── Click handlers ────────────────────────────────────────────────────────

  /** ALL highlighted words now go through the tooltip first */
  function handleHighlightClick(wordId: string, el: HTMLElement) {
    const token = currentSession?.tokens.find((t) => t.wordId === wordId);
    if (!token) return;
    const rect = el.getBoundingClientRect();
    setTooltip({
      word:          token.text,
      english:       currentSession?.wordTranslations[token.text.toLowerCase()] || null,
      loading:       false,
      anchor:        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      wordId:        token.wordId ?? undefined,
      status:        knownOverride.has(wordId) ? "known" : token.status,
    });
  }

  /** Plain (white) words — look up translation, then show tooltip */
  async function handlePlainWordClick(word: string, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    
    // Try to find if this word has a status/id in tokens
    const token = currentSession?.tokens.find(t => t.text.toLowerCase() === word.toLowerCase() && t.type === "word");

    setTooltip({ 
      word, 
      english: currentSession?.wordTranslations[word.toLowerCase()] || null, 
      loading: !currentSession?.wordTranslations[word.toLowerCase()], 
      anchor: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      wordId: token?.wordId ?? undefined,
      status: (token?.wordId && knownOverride.has(token.wordId)) ? "known" : token?.status
    });

    if (!currentSession?.wordTranslations[word.toLowerCase()]) {
      try {
        const entry = await defineWord(word);
        if (entry) {
          setDefinedEntries(prev => ({ ...prev, [word.toLowerCase()]: entry }));
          setTooltip((prev) => prev ? { 
            ...prev, 
            english: entry.translation, 
            loading: false, 
            wordId: String(entry.word_id),
            message: undefined 
          } : null);
        } else {
          setTooltip((prev) => prev ? { ...prev, english: null, loading: false, message: "Translation not available." } : null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        setTooltip((prev) => prev ? {
          ...prev, english: null, loading: false,
          message: isBackendNotReadyMessage(msg) ? "Translation needs backend support." : "Translation not available.",
        } : null);
      }
    }
  }

  /** "I know it" from the tooltip → instant API + local visual update */
  async function handleMarkKnown() {
    if (!user || !tooltip?.wordId || markingKnown) return;
    setMarkingKnown(true);
    try {
      await markKnownFlashcard(user.id, tooltip.wordId);
      setKnownOverride((prev) => new Set([...prev, tooltip.wordId!]));
      setTooltip(null);
    } catch {
      // silently fail — not critical
    } finally {
      setMarkingKnown(false);
    }
  }

  /** "Learn it" / "Review it" from the tooltip → open big modal */
  function handleOpenDetail() {
    if (!tooltip?.wordId) return;
    setModalWordId(tooltip.wordId);
    setTooltip(null);
  }

  function handleWordStatusChange(wordId: string, newStatus: "known" | "learning") {
    if (newStatus === "known") {
      setKnownOverride((prev) => new Set([...prev, wordId]));
    } else if (newStatus === "learning" && currentSession) {
      setCurrentSession({
        ...currentSession,
        tokens: currentSession.tokens.map(t => 
          t.wordId === wordId ? { ...t, status: "learning" } : t
        )
      });
    }
  }

  // ── Session loading ────────────────────────────────────────────────────────
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
      .finally(() => { if (!cancelled) setLoadingSession(false); });
    return () => { cancelled = true; };
  }, [sessionId, setCurrentSession, setLoadingSession, user?.id]);

  useEffect(() => { return () => { clearSession(); }; }, [clearSession]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeWord: HighlightedWord | null = useMemo(() => {
    if (!currentSession || !modalWordId) return null;
    
    // 1. Try finding in current session highlights
    const hw = currentSession.highlights.find((h) => h.wordId === modalWordId);
    if (hw) return hw;

    // 2. Try finding in on-the-fly defined entries
    const de = Object.values(definedEntries).find(e => String(e.word_id) === modalWordId);
    if (de) {
      return {
        wordId: String(de.word_id),
        dutch: de.word,
        english: de.translation,
        startIndex: 0,
        endIndex: 0,
        highlightType: "unknown", // Default for white words being promoted
        exampleSentences: de.examples || [],
        usageFrequency: "Common",
      } as unknown as HighlightedWord;
    }

    return null;
  }, [currentSession, modalWordId, definedEntries]);

  // Apply knownOverride to tokens — words marked known become "plain" (no highlight)
  const effectiveTokens = useMemo(() => {
    if (!currentSession) return [];
    if (knownOverride.size === 0) return currentSession.tokens;
    return currentSession.tokens.map(token => {
      if (token.wordId && knownOverride.has(token.wordId)) {
        return { ...token, status: null };
      }
      return token;
    });
  }, [currentSession, knownOverride]);

  function handleFinish() {
    const dur = Math.floor(elapsedRef.current / 1000);
    navigate(`/survey/${sessionId}?duration=${dur}`);
  }

  async function handleContinue() {
    if (!sessionId || !user || continuing) return;
    setContinuing(true);
    setContinueError(null);
    try {
      const nextSession = await continueSession(user.id, sessionId);
      setCurrentSession(nextSession);
      // Wait for React to render the new text, then scroll down
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      }, 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not continue this reading.";
      setContinueError(
        isBackendNotReadyMessage(message)
          ? "Continue reading needs backend support. Please finish this reading."
          : message
      );
    } finally {
      setContinuing(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading && !currentSession) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <div className="inline-flex items-center gap-2 text-text/60 font-body text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading
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
            <h2 className="font-heading font-semibold text-red-700">Couldn't load the session</h2>
            <p className="text-sm text-red-700/80 font-body mt-0.5">{error}</p>
            <button type="button" onClick={() => navigate("/reading")}
              className="mt-3 text-sm font-heading font-semibold text-red-700 underline">
              Back to Reading
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentSession) return null;

  const blueCount   = effectiveTokens.filter((t) => t.status === "new").length;
  const yellowCount = effectiveTokens.filter((t) => t.status === "learning").length;

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
        <h1 className="font-heading text-3xl font-bold text-text">{currentSession.title}</h1>
        <div className="mt-3 flex items-center gap-4 text-xs text-text/50 font-body">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} /> {formatElapsed(elapsedMs)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-blue-300" /> {blueCount} new
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-yellow-300" /> {yellowCount} learning
          </span>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-body text-text/50">
        <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-900">New words</span>
        <span className="rounded-full bg-yellow-100 px-2.5 py-1 font-semibold text-yellow-900">Learning words</span>
      </div>

      <div className="mb-6 rounded-lg border border-black/8 bg-white px-6 py-7 shadow-sm shadow-black/5 sm:px-8 sm:py-9">
        <HighlightedText
          tokens={effectiveTokens}
          onHighlightClick={handleHighlightClick}
          onPlainWordClick={handlePlainWordClick}
          activeWordId={modalWordId}
          activePlainWord={tooltip?.status == null ? (tooltip?.word ?? null) : null}
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
              "border border-primary/40 text-primary bg-white transition-colors",
              continuing ? "opacity-60 cursor-wait" : "hover:bg-primary/[0.06]",
            ].join(" ")}
          >
            {continuing ? (
              <><Loader2 size={16} className="animate-spin" /> Continuing</>
            ) : (
              <><BookPlus size={16} strokeWidth={2.3} /> Continue reading</>
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
            <CheckCircle2 size={16} strokeWidth={2.3} /> Finish reading
          </motion.button>
        </div>
        {continueError ? (
          <p className="max-w-xs text-right text-xs font-body text-red-600">{continueError}</p>
        ) : (
          <p className="text-right text-xs font-body text-text/45 sm:whitespace-nowrap">
            Read more on this topic, or finish when ready.
          </p>
        )}
      </div>

      {/* Small tooltip — first contact for ALL word clicks */}
      <WordTooltip
        lookup={tooltip}
        onClose={() => setTooltip(null)}
        onOpenDetail={handleOpenDetail}
        onMarkKnown={() => void handleMarkKnown()}
        markingKnown={markingKnown}
      />

      {/* Big modal — only shown after "Learn it" / "Review it" */}
      <WordModal
        word={activeWord}
        onClose={() => setModalWordId(null)}
        onWordStatusChange={handleWordStatusChange}
      />
    </motion.div>
  );
}
