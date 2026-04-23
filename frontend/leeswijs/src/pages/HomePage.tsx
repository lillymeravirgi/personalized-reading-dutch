import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  AlertCircle,
  BookOpen,
  Search,
  Layers,
  Clock,
  ChevronRight,
} from "lucide-react";

import { generateSession, readActivity, getCondition } from "../services/api";
import type { Activity } from "../services/api";
import { useStore } from "../store";

// CEFR ladder meta
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export default function HomePage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);

  // Load activity from localStorage once + whenever user changes.
  useEffect(() => {
    if (!user) return;
    setActivity(readActivity(user.id));
  }, [user]);

  // Computed stats. Must run before any early return so hook order is stable.
  const stats = useMemo(() => {
    if (!activity) {
      return {
        sessions: 0,
        wordsLookedUp: 0,
        flashcardsRemembered: 0,
        totalMinutes: 0,
      };
    }
    const totalMs = activity.sessions.reduce((sum, s) => sum + s.dwellMs, 0);
    return {
      sessions: activity.sessions.length,
      wordsLookedUp: activity.wordsLookedUp,
      flashcardsRemembered: activity.flashcardsRemembered,
      totalMinutes: Math.round(totalMs / 60_000),
    };
  }, [activity]);

  const weekSeries = useMemo(() => buildWeekSeries(activity), [activity]);

  if (!user) return null;

  const condition = getCondition();

  async function handleStart() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { sessionId } = await generateSession(user.id, condition);
      navigate(`/read/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const recentSessions = (activity?.sessions ?? []).slice().reverse().slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Greeting */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text">
            {greet()}, {user.name}
          </h1>
          <p className="mt-1 text-sm text-text/55 font-body">
            Here's where you are with your Dutch.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-heading font-semibold px-2.5 py-1 rounded-full text-white"
            style={{ backgroundColor: "var(--color-secondary)" }}
          >
            {user.cefrLevel ?? "—"}
          </span>
          <span
            className={[
              "text-[10px] font-heading font-semibold uppercase tracking-wide px-2 py-1 rounded-full",
              condition === "ADAPTIVE"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-black/8 text-text/60",
            ].join(" ")}
          >
            {condition}
          </span>
        </div>
      </div>

      {/* Quick start */}
      <div className="bg-white rounded-2xl shadow-xl shadow-black/8 px-7 py-7 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
            <BookOpen size={22} strokeWidth={2} />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-text">
              Start a reading session
            </h2>
            <p className="text-xs text-text/55 font-body">
              A fresh ~200-word Dutch text tailored to your {user.cefrLevel ?? "level"}.
            </p>
          </div>
        </div>
        <motion.button
          type="button"
          onClick={handleStart}
          disabled={loading}
          whileTap={{ scale: loading ? 1 : 0.97 }}
          className={[
            "inline-flex items-center gap-2 rounded-xl px-5 py-3",
            "text-sm font-heading font-semibold text-white",
            "bg-primary transition-opacity",
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
              <Sparkles size={16} strokeWidth={2.5} />
              Start New Session
              <ArrowRight size={16} strokeWidth={2.5} />
            </>
          )}
        </motion.button>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3"
        >
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 font-body">{error}</p>
        </motion.div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<BookOpen size={16} />}
          label="Sessions"
          value={stats.sessions}
          tone="primary"
        />
        <StatCard
          icon={<Search size={16} />}
          label="Words looked up"
          value={stats.wordsLookedUp}
          tone="slate"
        />
        <StatCard
          icon={<Layers size={16} />}
          label="Flashcards learned"
          value={stats.flashcardsRemembered}
          tone="amber"
        />
        <StatCard
          icon={<Clock size={16} />}
          label="Total time"
          value={`${stats.totalMinutes}m`}
          tone="slate"
        />
      </div>

      {/* Weekly activity + CEFR progress */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white rounded-2xl shadow-xl shadow-black/8 px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-sm font-bold text-text">
              This week
            </h3>
            <span className="text-xs font-body text-text/40">Minutes per day</span>
          </div>
          <WeekBars data={weekSeries} />
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-black/8 px-6 py-6">
          <h3 className="font-heading text-sm font-bold text-text mb-4">
            CEFR progress
          </h3>
          <CefrLadder current={user.cefrLevel ?? "A1"} />
        </div>
      </div>

      {/* Recent sessions */}
      <div className="bg-white rounded-2xl shadow-xl shadow-black/8 px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-bold text-text">
            Recent sessions
          </h3>
          <button
            type="button"
            onClick={() => navigate("/reading")}
            className="text-xs font-body font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            View all
            <ChevronRight size={12} />
          </button>
        </div>
        {recentSessions.length === 0 ? (
          <p className="text-sm font-body text-text/45">
            No sessions yet. Click <span className="font-semibold">Start New Session</span> above to generate your first reading.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentSessions.map((s) => (
              <li key={s.sessionId}>
                <button
                  type="button"
                  onClick={() => navigate(`/read/${s.sessionId}`)}
                  className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-black/8 px-4 py-3 hover:border-primary/30 hover:bg-primary/[0.02] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-heading font-semibold text-text truncate">
                      {s.title}
                    </p>
                    <p className="text-xs font-body text-text/45 mt-0.5">
                      {s.topic} · {s.cefrLevel} · {relTime(s.createdAt)}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-text/30 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

// Sub-components
function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "primary" | "slate" | "amber";
}) {
  const TONES: Record<string, { bg: string; text: string }> = {
    primary: { bg: "bg-primary/10",      text: "text-primary" },
    slate:   { bg: "bg-black/[0.04]",    text: "text-text/60" },
    amber:   { bg: "bg-amber-100",       text: "text-amber-700" },
  };
  const t = TONES[tone];
  return (
    <div className="bg-white rounded-2xl shadow-lg shadow-black/5 px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${t.bg} ${t.text}`}>
          {icon}
        </span>
        <span className="text-[11px] font-body font-semibold text-text/50 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="font-heading text-2xl font-bold text-text">{value}</p>
    </div>
  );
}

function WeekBars({ data }: { data: { label: string; minutes: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.minutes));
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d, i) => {
        const height = (d.minutes / max) * 100;
        const today = i === data.length - 1;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full flex-1 flex items-end">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className={[
                  "w-full rounded-t-lg",
                  today ? "bg-primary" : "bg-primary/30",
                  d.minutes === 0 ? "bg-black/8" : "",
                ].join(" ")}
                style={{ minHeight: 2 }}
                title={`${d.minutes.toFixed(1)} min`}
              />
            </div>
            <span className="text-[10px] font-body text-text/40">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function CefrLadder({ current }: { current: string }) {
  const idx = LEVELS.findIndex((l) => l === current);
  const pct = idx < 0 ? 0 : ((idx + 1) / LEVELS.length) * 100;
  return (
    <div>
      <div className="h-2.5 rounded-full bg-black/8 overflow-hidden mb-3">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="flex justify-between">
        {LEVELS.map((l, i) => (
          <span
            key={l}
            className={[
              "text-[11px] font-heading font-bold",
              i <= idx ? "text-primary" : "text-text/25",
            ].join(" ")}
          >
            {l}
          </span>
        ))}
      </div>
      <p className="mt-4 text-xs font-body text-text/50 leading-relaxed">
        {idx >= 0 && idx < LEVELS.length - 1 ? (
          <>Keep reading to progress past <span className="font-semibold text-text">{LEVELS[idx + 1]}</span>.</>
        ) : idx === LEVELS.length - 1 ? (
          "You're at the top. Nice."
        ) : (
          "Complete the assessment to set your level."
        )}
      </p>
    </div>
  );
}

// Helpers
function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function buildWeekSeries(
  activity: Activity | null
): { label: string; minutes: number }[] {
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const out: { label: string; minutes: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    const minutes = activity?.dailyMinutes?.[key] ?? 0;
    out.push({ label: DAY_LABELS[d.getDay()], minutes });
  }
  return out;
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1)      return "just now";
  if (m < 60)    return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)    return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
