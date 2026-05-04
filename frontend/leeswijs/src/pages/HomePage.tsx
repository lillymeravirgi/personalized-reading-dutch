import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  AlertCircle,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  Layers,
} from "lucide-react";

import ReadingGenerationStatus from "../components/ReadingGenerationStatus";
import { INTERESTS } from "../constants/interests";
import { generateSession, getCondition, readActivity } from "../services/api";
import type { Activity } from "../services/api";
import { useStore } from "../store";

export default function HomePage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    if (!user) return;
    setActivity(readActivity(user.id));
  }, [user]);

  const interestLabels = useMemo(() => {
    const labels = new Map(INTERESTS.map((it) => [it.id, it.label]));
    return user?.interests.map((id) => labels.get(id) ?? id) ?? [];
  }, [user?.interests]);

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

  const recentSessions = (activity?.sessions ?? []).slice().reverse().slice(0, 3);
  const latestSession = recentSessions[0] ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-5xl space-y-4"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading text-3xl font-bold text-text">
            Hi, {user.name}
          </h1>
          <p className="mt-1 text-sm text-text/55 font-body">
            Ready for a short Dutch reading session.
          </p>
        </div>
        <span
          className="text-xs font-heading font-semibold px-2.5 py-1 rounded-full text-white"
          style={{ backgroundColor: "var(--color-secondary)" }}
        >
          {user.cefrLevel ?? "—"}
        </span>
      </div>

      <div className="rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen size={22} strokeWidth={2} />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-text">
                New reading
              </h2>
              <p className="text-xs text-text/55 font-body">
                Generate one Dutch text for this session.
              </p>
            </div>
          </div>
          <motion.button
            type="button"
            onClick={handleStart}
            disabled={loading}
            whileTap={{ scale: loading ? 1 : 0.97 }}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-5 py-3",
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
                <BookOpen size={16} strokeWidth={2.5} />
                Start reading
                <ArrowRight size={16} strokeWidth={2.5} />
              </>
            )}
          </motion.button>
        </div>
        {loading && <ReadingGenerationStatus className="w-full sm:w-auto" />}
        {!loading && <StudyPath latestTitle={latestSession?.title ?? null} />}
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

      <div className="grid gap-4 md:grid-cols-5">
        <StudySetup
          level={user.cefrLevel}
          interests={interestLabels}
          onEdit={() => navigate("/settings")}
        />
        <NextStep
          latestTitle={latestSession?.title ?? null}
          onReview={
            latestSession
              ? () =>
                  navigate(
                    `/flashcards?sessionId=${encodeURIComponent(latestSession.sessionId)}`
                  )
              : undefined
          }
        />
      </div>

      <div className="rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-bold text-text">
            Recent readings
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
            No readings yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentSessions.map((s) => (
              <li key={s.sessionId}>
                <button
                  type="button"
                  onClick={() => navigate(`/read/${s.sessionId}`)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-black/8 px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
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

function StudyPath({ latestTitle }: { latestTitle: string | null }) {
  const items = [
    { label: "Read", detail: "Dutch text", icon: BookOpen, active: true },
    { label: "Review", detail: latestTitle ? "Words ready" : "After reading", icon: Layers, active: Boolean(latestTitle) },
    { label: "Check", detail: "Vocabulary", icon: ClipboardCheck, active: Boolean(latestTitle) },
  ];

  return (
    <div className="mt-5 grid gap-2 border-t border-black/6 pt-4 sm:grid-cols-3">
      {items.map(({ label, detail, icon: Icon, active }) => (
        <div
          key={label}
          className={[
            "flex items-center gap-3 rounded-lg border px-3 py-2.5",
            active
              ? "border-primary/15 bg-primary/[0.035]"
              : "border-black/8 bg-black/[0.015]",
          ].join(" ")}
        >
          <span
            className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              active ? "bg-primary/10 text-primary" : "bg-black/5 text-text/35",
            ].join(" ")}
          >
            <Icon size={16} />
          </span>
          <span className="min-w-0">
            <span className="block font-heading text-sm font-semibold text-text">
              {label}
            </span>
            <span className="block truncate text-xs font-body text-text/45">
              {detail}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function StudySetup({
  level,
  interests,
  onEdit,
}: {
  level: string | null;
  interests: string[];
  onEdit: () => void;
}) {
  return (
    <section className="rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5 md:col-span-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-heading text-sm font-bold text-text">
          Study setup
        </h3>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-body font-semibold text-primary hover:underline"
        >
          Edit
        </button>
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-body font-semibold uppercase tracking-wide text-text/45">
            Current level
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 font-heading text-sm font-bold text-white"
              style={{ backgroundColor: "var(--color-secondary)" }}
            >
              {level ?? "—"}
            </span>
            <span className="text-xs font-body text-text/45">
              Set by the vocabulary assessment.
            </span>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-body font-semibold uppercase tracking-wide text-text/45">
            Topics
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {interests.length > 0 ? (
              interests.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-body font-semibold text-primary"
                >
                  {label}
                </span>
              ))
            ) : (
              <span className="text-xs font-body text-text/45">
                Choose topics before generating a reading.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function NextStep({
  latestTitle,
  onReview,
}: {
  latestTitle: string | null;
  onReview?: () => void;
}) {
  return (
    <section className="rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5 md:col-span-3">
      <h3 className="font-heading text-sm font-bold text-text">
        Next step
      </h3>
      {latestTitle ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-body text-text/45">Latest reading</p>
            <p className="mt-1 truncate font-heading text-sm font-semibold text-text">
              {latestTitle}
            </p>
            <p className="mt-1 text-xs font-body text-text/50">
              Review selected words before the vocabulary check.
            </p>
          </div>
          <button
            type="button"
            onClick={onReview}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-2 text-xs font-heading font-semibold text-primary hover:bg-primary/[0.08]"
          >
            Review words
            <ArrowRight size={13} />
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm font-body text-text/50">
          Start a reading first. Review and vocabulary check will appear after that.
        </p>
      )}
    </section>
  );
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
