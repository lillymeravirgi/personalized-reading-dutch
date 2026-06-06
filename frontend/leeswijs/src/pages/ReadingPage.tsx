import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Lock,
  Loader2,
  Search,
} from "lucide-react";

import { generateSession, getOnboardingWordSetStatus, getVocabTestProgress, listSessions } from "../services/api";
import type { SessionSummary } from "../types";
import ReadingGenerationStatus from "../components/ReadingGenerationStatus";
import { useStore } from "../store";

const READINGS_PER_PHASE = 3;
const TARGET_WORDS_PER_PHASE = 10;

export default function ReadingPage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const userId = user?.id;
  const hasSwitchedConditions = user?.has_switched_conditions ?? false;

  const [sessions,     setSessions]     = useState<SessionSummary[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [loadingList,  setLoadingList]  = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [alertMsg,     setAlertMsg]     = useState<string | null>(null);
  const [query,        setQuery]        = useState("");
  const [immediateDone, setImmediateDone] = useState<number[]>([]);
  const [readyWordSets, setReadyWordSets] = useState<number[]>([]);

  const refreshSessions = useCallback(async () => {
    if (!userId) return;
    const phase = hasSwitchedConditions ? 2 : 1;
    try {
      const [data, progress, phaseWords] = await Promise.all([
        listSessions(userId),
        getVocabTestProgress(userId).catch(() => ({ immediateCompleted: [], delayedCompleted: [] })),
        getOnboardingWordSetStatus(userId, phase).catch(() => ({ ready: false })),
      ]);
      setSessions(data);
      setImmediateDone(progress.immediateCompleted);
      setReadyWordSets(phaseWords.ready ? [phase] : []);
    } finally {
      setLoadingList(false);
    }
  }, [hasSwitchedConditions, userId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    function refreshOnFocus() {
      void refreshSessions();
    }
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [refreshSessions]);

  if (!user) return null;

  const completedImmediate = new Set(immediateDone);
  const currentPhase = user.has_switched_conditions ? 2 : 1;
  const phaseSessions = sessions
    .filter((s) => s.study_phase === currentPhase)
    .sort((a, b) => a.reading_number - b.reading_number);
  const phaseSlots = Array.from({ length: READINGS_PER_PHASE }, (_, i) =>
    phaseSessions.find((s) => s.reading_number === i + 1) ?? null,
  );
  const generatedInPhase = new Set(phaseSessions.map((s) => s.reading_number));
  const completedCount = phaseSessions.filter((s) => s.survey_completed).length;
  const nextLocalReadingNumber = generatedInPhase.size + 1;
  const activeReading = phaseSessions.find((s) => !s.survey_completed) ?? null;
  const currentPhaseDone = completedImmediate.has(currentPhase);
  const nextTestSet =
    completedCount >= READINGS_PER_PHASE && !currentPhaseDone ? currentPhase : undefined;
  const currentWordSetReady = readyWordSets.includes(currentPhase);
  const needsCurrentWordSet =
    !activeReading &&
    !nextTestSet &&
    nextLocalReadingNumber <= READINGS_PER_PHASE &&
    !currentWordSetReady;
  const showWordSetCard =
    !activeReading &&
    !nextTestSet &&
    nextLocalReadingNumber <= READINGS_PER_PHASE;
  const allStudyComplete = currentPhase === 2 && currentPhaseDone;
  const phaseInstruction =
    currentPhase === 1
      ? `Complete ${READINGS_PER_PHASE} readings in Phase 1, then do the vocabulary check.`
      : `Phase 2: complete ${READINGS_PER_PHASE} readings, then do the vocabulary check.`;

  async function handleGenerate() {
    if (!user) return;
    if (activeReading) {
      setAlertMsg(`Please finish Phase ${currentPhase} Reading ${activeReading.reading_number} and complete its survey first.`);
      setTimeout(() => setAlertMsg(null), 4000);
      return;
    }
    if (nextTestSet) {
      setAlertMsg(`Please finish the Phase ${nextTestSet} vocabulary check before starting the next block.`);
      setTimeout(() => setAlertMsg(null), 4000);
      return;
    }
    if (!currentWordSetReady) {
      setAlertMsg(`Learn ${TARGET_WORDS_PER_PHASE} words before starting Phase ${currentPhase} readings.`);
      setTimeout(() => setAlertMsg(null), 4000);
      return;
    }
    if (nextLocalReadingNumber > READINGS_PER_PHASE) return;

    setLoading(true);
    setError(null);
    try {
      const { sessionId } = await generateSession(user.id);
      await refreshSessions();
      navigate(`/read/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      await refreshSessions();
      window.setTimeout(() => void refreshSessions(), 8_000);
    } finally {
      setLoading(false);
    }
  }

  const canGenerate =
    !loading &&
    !loadingList &&
    !activeReading &&
    !nextTestSet &&
    currentWordSetReady &&
    nextLocalReadingNumber <= READINGS_PER_PHASE;

  const filteredHistory = query.trim()
    ? sessions.filter((s) =>
        (s.title + " " + s.topic_used).toLowerCase().includes(query.toLowerCase())
      )
    : sessions;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-3xl space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">Reading</h1>
          <p className="text-sm font-body text-text/50">
            {nextTestSet
              ? `Phase ${nextTestSet} vocabulary check is ready.`
              : needsCurrentWordSet
              ? `Learn ${TARGET_WORDS_PER_PHASE} words to unlock this reading block.`
              : allStudyComplete
              ? "All reading phases are complete."
              : phaseInstruction}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3"
          >
            <AlertCircle size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700 font-body">{alertMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 font-body">{error}</p>
        </div>
      )}

      {showWordSetCard && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={[
            "rounded-lg border px-5 py-4",
            currentWordSetReady
              ? "border-black/8 bg-black/[0.025] text-text/55"
              : "border-primary/20 bg-primary/[0.04]",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className={[
                "font-heading text-sm font-bold mb-1",
                currentWordSetReady ? "text-text/55" : "text-primary",
              ].join(" ")}>
                {currentWordSetReady
                  ? `Phase ${currentPhase} word set completed`
                  : `Learn ${TARGET_WORDS_PER_PHASE} words for Phase ${currentPhase}`}
              </h3>
              <p className="text-xs font-body text-text/55">
                {currentWordSetReady
                  ? "You can generate the next reading now."
                  : "This unlocks the three readings in this phase."}
              </p>
            </div>
            {currentWordSetReady ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-black/8 bg-white px-3 py-2 text-xs font-heading font-semibold text-text/45">
                <CheckCircle2 size={14} /> Completed
              </span>
            ) : (
              <button
                type="button"
                onClick={() => navigate(`/onboarding/flashcards?phase=${currentPhase}`)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-heading font-semibold text-white hover:opacity-90"
              >
                Start word set <ArrowRight size={14} />
              </button>
            )}
          </div>
        </motion.div>
      )}

      <div className="rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen size={20} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-base font-bold text-text">Create reading task</h2>
            <p className="text-xs text-text/50 font-body">
              {nextTestSet
                ? `Check Phase ${nextTestSet} vocabulary before continuing.`
                : needsCurrentWordSet
                ? `Learn the ${TARGET_WORDS_PER_PHASE} words first.`
                : allStudyComplete
                ? "All study readings are complete."
                : `Phase ${currentPhase}: reading ${Math.min(nextLocalReadingNumber, READINGS_PER_PHASE)} of ${READINGS_PER_PHASE}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <motion.button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={!canGenerate}
            whileTap={canGenerate ? { scale: 0.97 } : {}}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-5 py-2.5",
              "text-sm font-heading font-semibold text-white bg-primary transition-opacity",
              !canGenerate ? "opacity-50 cursor-not-allowed" : "hover:opacity-90",
            ].join(" ")}
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Generating…</>
            ) : (
              <><BookOpen size={15} /> Generate<ArrowRight size={15} /></>
            )}
          </motion.button>
        </div>
        {loading && <ReadingGenerationStatus className="mt-4" />}
      </div>

      <div className="space-y-3">
        <h3 className="font-heading text-sm font-bold text-text">Study readings</h3>
        {loadingList ? (
          <div className="space-y-3">
            {Array.from({ length: READINGS_PER_PHASE }, (_, i) => i + 1).map((i) => (
              <div key={i} className="h-16 rounded-lg bg-black/4 animate-pulse" />
            ))}
          </div>
        ) : (
          phaseSlots.map((session, i) => {
            const num = i + 1;
            const localNum = num;
            const isActive    = session !== null && !session.survey_completed;
            const isCompleted = session !== null && session.survey_completed;
            const isLocked    = session === null && localNum > nextLocalReadingNumber;
            const isReady     = session === null && localNum === nextLocalReadingNumber && canGenerate;
            const isWaiting   = session === null && localNum === nextLocalReadingNumber && !canGenerate;

            return (
              <motion.div
                key={num}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className={[
                  "flex items-center gap-4 rounded-lg border px-4 py-3.5 transition-colors",
                  isCompleted
                    ? "border-black/8 bg-black/[0.02] opacity-60"
                    : isActive
                    ? "border-primary/25 bg-primary/[0.03]"
                    : isLocked
                    ? "border-black/8 bg-black/[0.015] opacity-40"
                    : isWaiting
                    ? "border-black/8 bg-black/[0.015] opacity-60"
                    : "border-black/8 bg-white hover:border-primary/20 cursor-pointer",
                ].join(" ")}
                onClick={() => {
                  if (isCompleted || isLocked) return;
                  if (session) navigate(`/read/${session.session_id}`);
                  else if (isReady) void handleGenerate();
                }}
              >
                <div className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  isCompleted ? "bg-emerald-50 text-emerald-600" : isActive ? "bg-primary/10 text-primary" : "bg-black/5 text-text/30",
                ].join(" ")}>
                  {isCompleted ? <CheckCircle2 size={18} /> : isLocked ? <Lock size={16} /> : <BookOpen size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-sm font-semibold text-text">
                    {session?.title ?? `Reading ${localNum}`}
                  </p>
                  <p className="text-xs font-body text-text/45 mt-0.5">
                    {isCompleted
                      ? "Completed"
                      : isActive
                      ? "In progress - tap to continue"
                      : isLocked
                      ? `Unlocks after Reading ${localNum - 1}`
                      : isWaiting && needsCurrentWordSet
                      ? "Learn the word set first"
                      : isWaiting && nextTestSet
                      ? "Vocabulary check comes next"
                      : "Ready to generate"}
                  </p>
                </div>
                {isActive && <ChevronRight size={16} className="text-primary shrink-0" />}
              </motion.div>
            );
          })
        )}
      </div>

      {(completedCount >= READINGS_PER_PHASE || currentPhaseDone) && (
        <div className="space-y-3">
          {(() => {
            const isDone = currentPhaseDone;
            const firstSession = phaseSessions.find((s) => s.reading_number === 1);
            const sgId = firstSession?.session_id ?? "";

            return (
              <motion.div
                key={currentPhase}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={[
                  "rounded-lg border px-5 py-4",
                  isDone
                    ? "border-black/8 bg-black/[0.025] text-text/50"
                    : "border-emerald-200 bg-emerald-50",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className={[
                      "font-heading text-sm font-bold mb-1",
                      isDone ? "text-text/55" : "text-emerald-800",
                    ].join(" ")}>
                      Phase {currentPhase} vocabulary {isDone ? "checked" : "ready"}
                    </h3>
                    <p className={[
                      "text-xs font-body",
                      isDone ? "text-text/45" : "text-emerald-700",
                    ].join(" ")}>
                      Words from the three readings in this phase.
                    </p>
                  </div>

                  {isDone ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-black/8 bg-white px-3 py-2 text-xs font-heading font-semibold text-text/45">
                      <CheckCircle2 size={14} /> Completed
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!sgId}
                      onClick={() => navigate(`/vocab-test/${sgId}?phase=${currentPhase}`)}
                      className="inline-flex items-center gap-2 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-heading font-semibold hover:opacity-90"
                    >
                      Start vocabulary check <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })()}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-heading text-sm font-bold text-text flex-1">Reading history</h3>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text/30" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="rounded-lg border border-black/10 bg-white pl-8 pr-3 py-1.5 text-xs font-body text-text placeholder:text-text/35 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
              />
            </div>
          </div>
          {filteredHistory.length === 0 ? (
            <p className="text-sm font-body text-text/45 py-6 text-center">No readings match "{query}".</p>
          ) : (
            <ul className="space-y-2">
              {filteredHistory.map((s) => (
                <li key={s.session_id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/read/${s.session_id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-black/8 bg-white px-5 py-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-heading font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                          {s.topic_used}
                        </span>
                      </div>
                      <p className="text-sm font-heading font-semibold text-text truncate">{s.title}</p>
                      <p className="text-xs font-body text-text/45 mt-1">{s.created_at ? relTime(s.created_at) : "Unknown date"}</p>
                    </div>
                    <ChevronRight size={16} className="text-text/30 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </motion.div>
  );
}

function relTime(iso: string): string {
  const then = parseBackendTime(iso);
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(then).toLocaleDateString();
}

function parseBackendTime(iso: string): number {
  const value = iso.trim().replace(" ", "T");
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimezone ? value : `${value}Z`).getTime();
}
