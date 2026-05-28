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
import type { BilingualSentence, HighlightedWord, LexiconEntry, TextToken } from "../types";

function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const TEAM_NAMES = new Set(["kim", "kiki", "julian", "tj", "evie", "jy"]);

function wordKey(word: string) {
  return word.trim().toLocaleLowerCase("nl-NL");
}

function canLookUpWord(word: string) {
  const key = wordKey(word);
  return key.length > 1 && !/\d/.test(key) && !TEAM_NAMES.has(key);
}

function cleanExamples(examples?: BilingualSentence[] | null) {
  return (examples ?? []).filter((s) => s.nl?.trim());
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
  const [definedEntries, setDefinedEntries] = useState<Record<string, LexiconEntry>>({});
  const [showReadingGuide, setShowReadingGuide] = useState(
    () => window.localStorage.getItem("leeswijs-reading-guide-seen") !== "true",
  );

  const { elapsedMs } = useReadingTimer(!!currentSession && !error);
  const elapsedRef = useRef(0);
  useEffect(() => { elapsedRef.current = elapsedMs; }, [elapsedMs]);

  function findLocalEntry(word: string, wordId?: string | null) {
    if (!currentSession) return null;
    const key = wordKey(word);
    const defined = definedEntries[key];
    if (defined) {
      return {
        wordId: String(defined.word_id),
        english: defined.translation,
        examples: cleanExamples(defined.examples),
      };
    }

    const highlight =
      currentSession.highlights.find((h) => wordKey(h.dutch) === key) ??
      currentSession.highlights.find((h) => h.wordId === wordId);
    if (highlight) {
      return {
        wordId: highlight.wordId,
        english: highlight.english,
        examples: cleanExamples(highlight.exampleSentences),
      };
    }

    const translation = currentSession.wordTranslations[key]
      ?? Object.entries(currentSession.wordTranslations).find(([k]) => wordKey(k) === key)?.[1];
    if (translation) {
      return { wordId: wordId ?? undefined, english: translation, examples: [] };
    }

    return null;
  }

  function contextExamplesFor(word: string, wordId?: string | null): BilingualSentence[] {
    if (!currentSession) return [];
    const key = wordKey(word);
    let index = currentSession.tokens.findIndex((token) =>
      token.type === "word" && wordKey(token.text) === key
    );
    if (index === -1 && wordId) {
      index = currentSession.tokens.findIndex((token) =>
        token.type === "word" && token.wordId === wordId
      );
    }
    if (index === -1) return [];

    let start = index;
    while (start > 0 && !/[.!?]/.test(currentSession.tokens[start - 1].text)) start -= 1;

    let end = index;
    while (end < currentSession.tokens.length - 1 && !/[.!?]/.test(currentSession.tokens[end].text)) end += 1;

    const sentence = currentSession.tokens
      .slice(start, end + 1)
      .map((token) => token.text)
      .join("")
      .replace(/\s+/g, " ")
      .trim();

    return sentence ? [{ nl: sentence, en: "" }] : [];
  }

  async function fetchMissingTranslation(word: string, wordId?: string | null) {
    const key = wordKey(word);
    try {
      const entry = await defineWord(word);
      if (!entry) {
        setTooltip((prev) => prev && wordKey(prev.word) === key
          ? { ...prev, english: null, loading: false, message: "Translation not available yet." }
          : prev
        );
        return;
      }

      setDefinedEntries((prev) => ({
        ...prev,
        [key]: entry,
        [wordKey(entry.word)]: entry,
      }));
      setTooltip((prev) => prev && wordKey(prev.word) === key
        ? {
            ...prev,
            english: entry.translation,
            loading: false,
            wordId: String(entry.word_id),
            message: undefined,
          }
        : prev
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setTooltip((prev) => prev && wordKey(prev.word) === key
        ? {
            ...prev,
            english: null,
            loading: false,
            wordId: wordId ?? prev.wordId,
            message: isBackendNotReadyMessage(msg)
              ? "Translation needs backend support."
              : "Translation not available yet.",
          }
        : prev
      );
    }
  }

  // ── Click handlers ────────────────────────────────────────────────────────

  /** ALL highlighted words now go through the tooltip first */
  function handleHighlightClick(token: TextToken, el: HTMLElement) {
    const wordId = token.wordId ?? undefined;
    const rect = el.getBoundingClientRect();
    const localEntry = findLocalEntry(token.text, wordId);
    const canLookup = canLookUpWord(token.text);
    setTooltip({
      word:          token.text,
      english:       localEntry?.english || null,
      loading:       !localEntry?.english && canLookup,
      anchor:        { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      wordId:        localEntry?.wordId ?? wordId,
      status:        wordId && knownOverride.has(wordId) ? "known" : token.status,
      message:       canLookup ? undefined : "This looks like a name, so it is not added to vocabulary.",
    });
    if (!localEntry?.english && canLookup) void fetchMissingTranslation(token.text, wordId);
  }

  /** Plain (white) words — look up translation, then show tooltip */
  async function handlePlainWordClick(word: string, el: HTMLElement) {
    if (!canLookUpWord(word)) return;
    const rect = el.getBoundingClientRect();

    // Try to find if this word has a status/id in tokens
    const key = wordKey(word);
    const token = currentSession?.tokens.find(t => wordKey(t.text) === key && t.type === "word");
    const localEntry = findLocalEntry(word, token?.wordId);

    setTooltip({ 
      word, 
      english: localEntry?.english || null,
      loading: !localEntry?.english,
      anchor: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      wordId: localEntry?.wordId ?? token?.wordId ?? undefined,
      status: (token?.wordId && knownOverride.has(token.wordId)) ? "known" : token?.status
    });

    if (!localEntry?.english) await fetchMissingTranslation(word, token?.wordId);
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
  const activeWord: HighlightedWord | null = (() => {
    if (!currentSession || !modalWordId) return null;

    // 1. Try finding in current session highlights
    const hw = currentSession.highlights.find((h) => h.wordId === modalWordId);
    if (hw) {
      const localEntry = findLocalEntry(hw.dutch, hw.wordId);
      const examples = cleanExamples(hw.exampleSentences);
      return {
        ...hw,
        english: hw.english || localEntry?.english || "",
        exampleSentences: examples.length > 0
          ? examples
          : localEntry?.examples.length
            ? localEntry.examples
            : contextExamplesFor(hw.dutch, hw.wordId),
      };
    }

    // 2. Try finding in on-the-fly defined entries
    const de = Object.values(definedEntries).find(e => String(e.word_id) === modalWordId);
    if (de) {
      return {
        wordId: String(de.word_id),
        dutch: de.word,
        english: de.translation,
        startIndex: 0,
        endIndex: 0,
        highlightType: "unknown",
        exampleSentences: cleanExamples(de.examples).length > 0
          ? cleanExamples(de.examples)
          : contextExamplesFor(de.word, String(de.word_id)),
        usageFrequency: "common",
      };
    }

    return null;
  })();

  // Apply knownOverride to tokens — words marked known become "plain" (no highlight)
  const effectiveTokens = useMemo(() => {
    if (!currentSession) return [];
    return currentSession.tokens.map(token => {
      if (token.type === "word" && !canLookUpWord(token.text)) {
        return { ...token, status: null, wordId: null };
      }
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

  function dismissReadingGuide() {
    window.localStorage.setItem("leeswijs-reading-guide-seen", "true");
    setShowReadingGuide(false);
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

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] font-body text-text/45">
        <span className="rounded-md border border-blue-200/80 bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-800">
          New words
        </span>
        <span className="rounded-md border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
          Learning words
        </span>
      </div>

      {showReadingGuide && (
        <div className="mb-4 rounded-lg border border-primary/15 bg-primary/[0.035] px-3.5 py-2.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-xs font-body leading-5 text-text/60">
              Blue words are new target words. Yellow words are words you are reviewing.
              Select any word for help, then finish the reading when you are ready.
            </p>
            <button
              type="button"
              onClick={dismissReadingGuide}
              className="self-start rounded-lg border border-primary/20 bg-white px-2.5 py-1 text-xs font-heading font-semibold text-primary hover:bg-primary/[0.06]"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-black/8 bg-white px-6 py-7 shadow-sm shadow-black/5 sm:px-8 sm:py-9">
        <HighlightedText
          tokens={effectiveTokens}
          onHighlightClick={handleHighlightClick}
          onPlainWordClick={handlePlainWordClick}
          activeWordId={modalWordId}
          activePlainWord={tooltip?.status == null ? (tooltip?.word ?? null) : null}
          isLookupWord={canLookUpWord}
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
