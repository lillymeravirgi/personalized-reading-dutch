import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  BookPlus,
  Loader2,
} from "lucide-react";

import {
  getReadingSession,
  defineWord,
  isBackendNotReadyMessage,
  markKnownFlashcard,
  continueSession,
  logInteraction,
} from "../services/api";
import { easeOut } from "../constants/animation";
import ErrorBanner from "../components/ErrorBanner";
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
  const [searchParams] = useSearchParams();

  const currentSession = useStore((s) => s.currentSession);
  const isLoading = useStore((s) => s.isLoadingSession);
  const setCurrentSession = useStore((s) => s.setCurrentSession);
  const setLoadingSession = useStore((s) => s.setLoadingSession);
  const clearSession = useStore((s) => s.clearSession);
  const user = useStore((s) => s.user);

  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  const [tooltip, setTooltip] = useState<TooltipWord | null>(null);
  const [markingKnown, setMarkingKnown] = useState(false);
  const [knownOverride, setKnownOverride] = useState<Set<string>>(new Set());

  const [modalWordId, setModalWordId] = useState<string | null>(null);
  const [definedEntries, setDefinedEntries] = useState<Record<string, LexiconEntry>>({});

  const isReviewRoute = searchParams.get("review") === "1";
  const isReadOnly = isReviewRoute || Boolean(currentSession?.surveyCompleted);

  const { elapsedMs } = useReadingTimer(!!currentSession && !error && !isReadOnly);
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

  function handleHighlightClick(token: TextToken, el: HTMLElement) {
    const wordId = token.wordId ?? undefined;
    const rect = el.getBoundingClientRect();
    const localEntry = findLocalEntry(token.text, wordId);
    const canLookup = canLookUpWord(token.text);
    setTooltip({
      word: token.text,
      english: localEntry?.english || null,
      loading: !localEntry?.english && canLookup,
      anchor: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      wordId: localEntry?.wordId ?? wordId,
      status: wordId && knownOverride.has(wordId) ? "known" : token.status,
      message: canLookup ? undefined : "This looks like a name, so it is not added to vocabulary.",
    });
    if (!localEntry?.english && canLookup) void fetchMissingTranslation(token.text, wordId);
  }

  async function handlePlainWordClick(word: string, el: HTMLElement) {
    if (!canLookUpWord(word)) return;
    const rect = el.getBoundingClientRect();

    const key = wordKey(word);
    const token = currentSession?.tokens.find(t => wordKey(t.text) === key && t.type === "word");
    const localEntry = findLocalEntry(word, token?.wordId);

    setTooltip({
      word,
      english: localEntry?.english || null,
      loading: !localEntry?.english,
      anchor: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      wordId: localEntry?.wordId ?? token?.wordId ?? undefined,
      status: (token?.wordId && knownOverride.has(token.wordId)) ? "known" : token?.status,
    });

    if (!localEntry?.english) await fetchMissingTranslation(word, token?.wordId);
  }

  async function handleMarkKnown() {
    if (isReadOnly) return;
    if (!user || !tooltip?.wordId || markingKnown) return;
    setMarkingKnown(true);
    try {
      await markKnownFlashcard(user.id, tooltip.wordId);
      setKnownOverride((prev) => new Set([...prev, tooltip.wordId!]));
      if (currentSession) {
        logInteraction({
          wordId: tooltip.wordId,
          sessionId: currentSession.sessionId,
          action: "word_avoidance",
          weight: 1,
          timestamp: new Date().toISOString(),
        }).catch(() => undefined);
      }
      setTooltip(null);
    } catch {
      setError("Could not update this word yet.");
    } finally {
      setMarkingKnown(false);
    }
  }

  function handleOpenDetail() {
    if (!tooltip?.wordId) return;
    if (currentSession && !isReadOnly) {
      logInteraction({
        wordId: tooltip.wordId,
        sessionId: currentSession.sessionId,
        action: "deep_processing",
        weight: 5,
        timestamp: new Date().toISOString(),
      }).catch(() => undefined);
    }
    setModalWordId(tooltip.wordId);
    setTooltip(null);
  }

  function handleWordStatusChange(wordId: string, newStatus: "known" | "learning") {
    if (isReadOnly) return;
    if (newStatus === "known") {
      setKnownOverride((prev) => new Set([...prev, wordId]));
    } else if (newStatus === "learning" && currentSession) {
      logInteraction({
        wordId,
        sessionId: currentSession.sessionId,
        action: "acquisition_intent",
        weight: 2,
        timestamp: new Date().toISOString(),
      }).catch(() => undefined);
      setCurrentSession({
        ...currentSession,
        tokens: currentSession.tokens.map(t =>
          t.wordId === wordId ? { ...t, status: "learning" } : t
        )
      });
    }
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
      .finally(() => { if (!cancelled) setLoadingSession(false); });
    return () => { cancelled = true; };
  }, [sessionId, setCurrentSession, setLoadingSession, user?.id]);

  useEffect(() => { return () => { clearSession(); }; }, [clearSession]);

  const activeWord: HighlightedWord | null = (() => {
    if (!currentSession || !modalWordId) return null;

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

    const de = Object.values(definedEntries).find(e => String(e.word_id) === modalWordId);
    if (de) {
      const examples = cleanExamples(de.examples);
      return {
        wordId: String(de.word_id),
        dutch: de.word,
        english: de.translation,
        startIndex: 0,
        endIndex: 0,
        highlightType: "unknown",
        exampleSentences: examples.length > 0
          ? examples
          : contextExamplesFor(de.word, String(de.word_id)),
        usageFrequency: "common",
      };
    }

    return null;
  })();

  const effectiveTokens = useMemo(() => {
    if (!currentSession) return [];

    const highlightMap = new Map<string, { status: "learning" | "new", wordId: string }>();
    currentSession.highlights.forEach(h => {
      highlightMap.set(h.dutch.toLowerCase(), {
        status: h.highlightType === "learning" ? "learning" : "new",
        wordId: h.wordId
      });
    });

    const parts = currentSession.rawText.split(/(\[\[[^\]]+\]\])/);
    const tokens: TextToken[] = [];

    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("[[") && part.endsWith("]]")) {
        const rawWord = part.slice(2, -2);
        const low = rawWord.toLowerCase();
        const match = highlightMap.get(low);
        let status: "learning" | "new" | null = match?.status ?? null;
        
        if (status && match && knownOverride.has(match.wordId)) status = null;
        if (!canLookUpWord(rawWord)) status = null;

        tokens.push({
          text: rawWord,
          type: "word",
          status,
          wordId: match?.wordId ?? null,
        });
      } else {
        const subParts = part.split(/([^\w\u00C0-\u017F]+)/);
        for (const sp of subParts) {
          if (!sp) continue;
          if (/^[^\w\u00C0-\u017F]+$/.test(sp)) {
            tokens.push({
              text: sp,
              type: /^\s+$/.test(sp) ? "space" : "punctuation",
            });
          } else {
            const low = sp.toLowerCase();
            const match = highlightMap.get(low);
            tokens.push({
              text: sp,
              type: "word",
              status: null,
              wordId: match?.wordId ?? null,
            });
          }
        }
      }
    }
    
    return tokens;
  }, [currentSession, knownOverride]);

  function handleFinish() {
    if (isReadOnly) {
      navigate("/reading");
      return;
    }
    const dur = Math.floor(elapsedRef.current / 1000);
    navigate(`/survey/${sessionId}?duration=${dur}`);
  }

  async function handleContinue() {
    if (isReadOnly) return;
    if (!sessionId || !user || continuing) return;
    setContinuing(true);
    setContinueError(null);
    try {
      const nextSession = await continueSession(user.id, sessionId);
      if (currentSession) {
        const existingWordIds = new Set(currentSession.highlights.map((h) => h.wordId));
        const newHighlights = nextSession.highlights.filter(
          (h) => !existingWordIds.has(h.wordId)
        );
        setCurrentSession({
          ...nextSession,
          highlights: [...currentSession.highlights, ...newHighlights],
        });
      } else {
        setCurrentSession(nextSession);
      }
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
        <ErrorBanner message={error} title="Couldn't load the session" />
        <button type="button" onClick={() => navigate("/reading")}
          className="mt-3 text-sm font-heading font-semibold text-red-700 underline">
          Back to Reading
        </button>
      </div>
    );
  }

  if (!currentSession) return null;

  const blueCount = effectiveTokens.filter((t) => t.status === "new").length;
  const yellowCount = effectiveTokens.filter((t) => t.status === "learning").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: easeOut }}
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
        {isReadOnly ? (
          <button
            type="button"
            onClick={() => navigate("/reading")}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-white px-5 py-2.5 text-sm font-heading font-semibold text-primary hover:bg-primary/[0.06]"
          >
            Back to Reading
          </button>
        ) : (
          <>
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
          </>
        )}
      </div>

      <WordTooltip
        lookup={tooltip}
        onClose={() => {
          if (tooltip?.wordId && currentSession && !isReadOnly) {
            logInteraction({
              wordId: tooltip.wordId,
              sessionId: currentSession.sessionId,
              action: "word_avoidance",
              weight: 1,
              timestamp: new Date().toISOString(),
            }).catch(() => undefined);
          }
          setTooltip(null);
        }}
        onOpenDetail={handleOpenDetail}
        onMarkKnown={() => void handleMarkKnown()}
        markingKnown={markingKnown}
        readOnly={isReadOnly}
      />

      <WordModal
        word={activeWord}
        onClose={() => setModalWordId(null)}
        onWordStatusChange={handleWordStatusChange}
        readOnly={isReadOnly}
      />
    </motion.div>
  );
}
