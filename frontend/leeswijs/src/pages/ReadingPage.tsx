/**
 * ReadingPage — the primary workspace for generating and browsing readings.
 * Previously this content lived on HomePage; the Home route is now the analytics dashboard.
 */
import { useEffect, useState } from "react";
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

import { generateSession, listSessions, getCondition } from "../services/api";
import type { SessionSummary } from "../types";
import { READING_STYLES, type ReadingStyle } from "../types";
import ReadingGenerationStatus from "../components/ReadingGenerationStatus";
import { useStore } from "../store";

const MAX_GATED = 3;

export default function ReadingPage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const [sessions,     setSessions]     = useState<SessionSummary[]>([]);
  const [style,        setStyle]        = useState<ReadingStyle>("Narrative (Story)");
  const [loading,      setLoading]      = useState(false);
  const [loadingList,  setLoadingList]  = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [alertMsg,     setAlertMsg]     = useState<string | null>(null);
  // History will now use the sessions array directly from the API
  const [query,        setQuery]        = useState("");

  const refreshSessions = async () => {
    if (!user) return;
    const data = await listSessions(user.id);
    setSessions(data);
    setLoadingList(false);
  };

  useEffect(() => {
    if (!user) return;
    void refreshSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return null;

  // ── Derive reading slots 1-3 ────────────────────────────────────────────────
  const slots: Array<SessionSummary | null> = [
    sessions.find((s) => s.reading_number === 1) ?? null,
    sessions.find((s) => s.reading_number === 2) ?? null,
    sessions.find((s) => s.reading_number === 3) ?? null,
  ];
  const completedCount   = sessions.filter((s) => s.survey_completed && s.reading_number <= MAX_GATED).length;
  const allGatedComplete = completedCount >= MAX_GATED;
  const nextReadingNumber = sessions.filter((s) => s.reading_number <= MAX_GATED).length + 1;
  const activeGated = sessions.find((s) => s.reading_number <= MAX_GATED && !s.survey_completed) ?? null;

  async function handleGenerate() {
    if (!user) return;
    if (activeGated) {
      setAlertMsg(`Please finish Reading ${activeGated.reading_number} and complete its survey first 😊`);
      setTimeout(() => setAlertMsg(null), 4000);
      return;
    }
    if (nextReadingNumber > MAX_GATED && !allGatedComplete) return;

    setLoading(true);
    setError(null);
    try {
      const { sessionId } = await generateSession(user.id, getCondition(nextReadingNumber), style);
      await refreshSessions();
      navigate(`/read/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const canGenerate =
    !loading &&
    (sessions.filter((s) => s.reading_number <= MAX_GATED).length < MAX_GATED
      ? !activeGated
      : allGatedComplete);

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
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">Reading</h1>
          <p className="text-sm font-body text-text/50">
            {allGatedComplete
              ? "Free reading mode unlocked — generate as many as you like!"
              : `Complete ${MAX_GATED} readings and their surveys to unlock the vocabulary test.`}
          </p>
        </div>
      </div>

      {/* ── Alert ── */}
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

      {/* ── Generator card ── */}
      <div className="rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen size={20} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-base font-bold text-text">Generate new reading</h2>
            <p className="text-xs text-text/50 font-body">
              {allGatedComplete
                ? "Free mode — generate as many readings as you like."
                : `Reading ${Math.min(nextReadingNumber, MAX_GATED)} of ${MAX_GATED}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as ReadingStyle)}
            className="rounded-lg border border-black/12 bg-black/[0.02] px-3 py-2 text-sm font-body text-text outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
          >
            {READING_STYLES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
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

      {/* ── Study slots 1-3 ── */}
      <div className="space-y-3">
        <h3 className="font-heading text-sm font-bold text-text">Study readings</h3>
        {loadingList ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-black/4 animate-pulse" />
            ))}
          </div>
        ) : (
          slots.map((session, i) => {
            const num = i + 1;
            const isActive    = session !== null && !session.survey_completed;
            const isCompleted = session !== null && session.survey_completed;
            const isLocked    = session === null && num > nextReadingNumber;

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
                    : "border-black/8 bg-white hover:border-primary/20 cursor-pointer",
                ].join(" ")}
                onClick={() => {
                  if (isCompleted || isLocked) return;
                  if (session) navigate(`/read/${session.session_id}`);
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
                    {session?.title ?? `Reading ${num}`}
                  </p>
                  <p className="text-xs font-body text-text/45 mt-0.5">
                    {isCompleted
                      ? "Completed ✓"
                      : isActive
                      ? "In progress — tap to continue"
                      : isLocked
                      ? `Unlocks after Reading ${num - 1}`
                      : "Ready to generate"}
                  </p>
                </div>
                {isActive && <ChevronRight size={16} className="text-primary shrink-0" />}
              </motion.div>
            );
          })
        )}
      </div>

      {/* ── Vocab test CTA ── */}
      {allGatedComplete && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4"
        >
          <h3 className="font-heading text-sm font-bold text-emerald-800 mb-1">
            🎉 Vocabulary test unlocked!
          </h3>
          <p className="text-xs font-body text-emerald-700 mb-3">
            Test your memory of the 7 words you studied before the readings.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/vocab-test/${sessions.find((s) => s.reading_number === 1)?.session_id ?? ""}`)}
            className="inline-flex items-center gap-2 bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-heading font-semibold hover:opacity-90"
          >
            Start vocabulary test <ArrowRight size={14} />
          </button>
        </motion.div>
      )}

      {/* ── Reading history ── */}
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
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
