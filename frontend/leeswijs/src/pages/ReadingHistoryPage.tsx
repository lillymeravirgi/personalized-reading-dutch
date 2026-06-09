import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen,
  ArrowRight,
  ChevronRight,
  Search,
} from "lucide-react";

import {
  readActivity,
  type Activity,
} from "../services/api";
import { easeOut } from "../constants/animation";
import { useStore } from "../store";

export default function ReadingHistoryPage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const [sessions, setSessions] = useState<Activity["sessions"]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!user) return;
    const a = readActivity(user.id);
    setSessions([...a.sessions].reverse());
  }, [user]);

  if (!user) return null;

  function handleStart() {
    navigate("/reading");
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
      transition={{ duration: 0.35, ease: easeOut }}
      className="mx-auto max-w-5xl"
    >
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpen size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">
            Reading history
          </h1>
          <p className="text-sm font-body text-text/50">
            Past reading tasks are saved here.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-black/8 bg-white px-4 py-4 shadow-sm shadow-black/5">
        <motion.button
          type="button"
          onClick={handleStart}
          whileTap={{ scale: 0.97 }}
          className={[
            "inline-flex items-center gap-2 rounded-xl px-4 py-2.5",
            "text-sm font-heading font-semibold text-white bg-primary",
            "hover:opacity-90",
          ].join(" ")}
        >
          <BookOpen size={15} strokeWidth={2.5} />
          New reading
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

      {sessions.length === 0 ? (
        <EmptyState onStart={handleStart} />
      ) : filtered.length === 0 ? (
        <p className="text-sm font-body text-text/45 py-10 text-center">
          No readings match "{query}".
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={s.sessionId}>
              <button
                type="button"
                onClick={() => navigate(`/read/${s.sessionId}`)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-black/8 bg-white px-5 py-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-heading font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                      {s.topic}
                    </span>
                  </div>
                  <p className="text-sm font-heading font-semibold text-text truncate">
                    {s.title}
                  </p>
                  <p className="text-xs font-body text-text/45 mt-1 flex items-center gap-3">
                    <span>{relTime(s.createdAt)}</span>
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

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-black/8 bg-white px-6 py-14 text-center shadow-sm shadow-black/5">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
        <BookOpen size={26} className="text-primary" strokeWidth={1.8} />
      </div>
      <h2 className="font-heading text-xl font-bold text-text mb-1">
        No readings yet
      </h2>
      <p className="text-sm font-body text-text/50 max-w-sm mb-6">
        Generate your first Dutch reading task.
      </p>
      <motion.button
        type="button"
        onClick={onStart}
        whileTap={{ scale: 0.97 }}
        className={[
          "inline-flex items-center gap-2 rounded-xl px-5 py-3",
          "text-sm font-heading font-semibold text-white bg-primary",
          "hover:opacity-90",
        ].join(" ")}
      >
        <BookOpen size={15} strokeWidth={2.5} />
        Start first reading
        <ArrowRight size={15} strokeWidth={2.5} />
      </motion.button>
    </div>
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
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

function parseBackendTime(iso: string): number {
  const value = iso.trim().replace(" ", "T");
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimezone ? value : `${value}Z`).getTime();
}
