import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Clock,
  Search,
} from "lucide-react";

import {
  generateSession,
  getCondition,
  readActivity,
  type SessionLogEntry,
} from "../services/api";
import { useStore } from "../store";

export default function ReadingHistoryPage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const [sessions, setSessions] = useState<SessionLogEntry[]>([]);
  const [query,    setQuery]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const a = readActivity(user.id);
    // Most recent first.
    setSessions([...a.sessions].reverse());
  }, [user]);

  if (!user) return null;

  async function handleStart() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { sessionId } = await generateSession(user.id, getCondition());
      navigate(`/read/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = query.trim()
    ? sessions.filter((s) =>
        (s.title + " " + s.topic).toLowerCase().includes(query.toLowerCase())
      )
    : sessions;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-3xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
          <BookOpen size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">
            Your reading library
          </h1>
          <p className="text-sm font-body text-text/50">
            Every text you've generated. Click to re-open.
          </p>
        </div>
      </div>

      {/* Top bar: new session + search */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <motion.button
          type="button"
          onClick={handleStart}
          disabled={loading}
          whileTap={{ scale: loading ? 1 : 0.97 }}
          className={[
            "inline-flex items-center gap-2 rounded-xl px-4 py-2.5",
            "text-sm font-heading font-semibold text-white bg-primary",
            loading ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
          ].join(" ")}
        >
          {loading ? (
            <>
              <Spinner />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={15} strokeWidth={2.5} />
              New Session
            </>
          )}
        </motion.button>

        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text/30"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or topic"
            className="w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 py-2.5 text-sm font-body text-text placeholder:text-text/35 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
          />
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-body"
        >
          {error}
        </motion.div>
      )}

      {/* Body */}
      {sessions.length === 0 ? (
        <EmptyState onStart={handleStart} loading={loading} />
      ) : filtered.length === 0 ? (
        <p className="text-sm font-body text-text/45 py-10 text-center">
          No sessions match "{query}".
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={s.sessionId}>
              <button
                type="button"
                onClick={() => navigate(`/read/${s.sessionId}`)}
                className="w-full text-left bg-white rounded-xl border border-black/8 px-5 py-4 hover:border-primary/30 hover:bg-primary/[0.02] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="text-[10px] font-heading font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: "var(--color-secondary)", color: "#fff" }}
                    >
                      {s.cefrLevel}
                    </span>
                    <span className="text-[10px] font-heading font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {s.topic}
                    </span>
                    {s.isAdaptive && (
                      <span className="text-[10px] font-heading font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        Personalised
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-heading font-semibold text-text truncate">
                    {s.title}
                  </p>
                  <p className="text-xs font-body text-text/45 mt-1 flex items-center gap-3">
                    <span>{relTime(s.createdAt)}</span>
                    {s.dwellMs > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> {Math.max(1, Math.round(s.dwellMs / 60_000))}m
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight size={16} className="text-text/30 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

// Sub-components
function EmptyState({ onStart, loading }: { onStart: () => void; loading: boolean }) {
  return (
    <div className="flex flex-col items-center text-center py-14 bg-white rounded-2xl shadow-xl shadow-black/8 px-6">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <BookOpen size={26} className="text-primary" strokeWidth={1.8} />
      </div>
      <h2 className="font-heading text-xl font-bold text-text mb-1">
        No sessions yet
      </h2>
      <p className="text-sm font-body text-text/50 max-w-sm mb-6">
        Generate your first Dutch reading tailored to your level and interests.
      </p>
      <motion.button
        type="button"
        onClick={onStart}
        disabled={loading}
        whileTap={{ scale: loading ? 1 : 0.97 }}
        className={[
          "inline-flex items-center gap-2 rounded-xl px-5 py-3",
          "text-sm font-heading font-semibold text-white bg-primary",
          loading ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
        ].join(" ")}
      >
        {loading ? <Spinner /> : <Sparkles size={15} strokeWidth={2.5} />}
        Start first session
        {!loading && <ArrowRight size={15} strokeWidth={2.5} />}
      </motion.button>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
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
