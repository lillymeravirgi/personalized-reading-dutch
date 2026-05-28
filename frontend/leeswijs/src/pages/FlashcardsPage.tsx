import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Check, Home, Hourglass, Layers, RotateCcw, Sparkles } from "lucide-react";
import { useStore } from "../store";
import {
  addDiscoveredToLearn,
  discoverPrefetch,
  getFlashcards,
  markKnownFlashcard,
  submitFlashcardReview,
  type DiscoverCard,
  type FlashcardsResponse,
} from "../services/api";
import type { FlashcardItem, ReviewInterval } from "../types";
import SpeakButton from "../components/SpeakButton";

// ─── Constants ────────────────────────────────────────────────────────────────
type Mode = "review" | "discover";

const INTERVALS: { label: string; value: ReviewInterval; days: number }[] = [
  { label: "Today",    value: "today", days: 0  },
  { label: "1 day",   value: "1d",    days: 1  },
  { label: "2 days",  value: "2d",    days: 2  },
  { label: "4 days",  value: "4d",    days: 4  },
  { label: "1 week",  value: "1w",    days: 7  },
  { label: "1 month", value: "1m",    days: 30 },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FlashcardsPage() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);

  const [mode, setMode] = useState<Mode>("review");

  // Review state
  const [reviewData,    setReviewData]    = useState<FlashcardsResponse | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewError,   setReviewError]   = useState<string | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0); // live count for header

  // Discover state
  const [discoverCards,   setDiscoverCards]   = useState<DiscoverCard[]>([]);
  const [discoverFetched, setDiscoverFetched] = useState(false);

  const fetchReview = useCallback(() => {
    if (!user) return;
    setReviewLoading(true);
    getFlashcards(null, user.id)
      .then((res) => {
        if (res.success) setReviewData(res.data);
        else setReviewError(res.error ?? "Could not load word review.");
      })
      .catch(() => setReviewError("Unexpected error."))
      .finally(() => setReviewLoading(false));
  }, [user]);

  // Load review cards on mount
  useEffect(() => {
    fetchReview();
  }, [fetchReview]);

  // ── Background warm-up on mount & Refill on exit ─────────────────────────
  // Silently pre-loads the reservoir the moment this page opens.
  // When the user leaves, we tell the backend to check if it needs a refill.
  useEffect(() => {
    if (!user) return;
    discoverPrefetch(user.id)
      .then(({ words }) => {
        setDiscoverCards(words);
        setDiscoverFetched(true);
      })
      .catch(() => { setDiscoverFetched(true); }); // mark fetched even on error

    // 2. The Exit Trigger
    return () => {
      // Use the VITE_API_BASE_URL if available, else default to 8000
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
      navigator.sendBeacon(`${baseUrl}/flashcards/refill-check?user_id=${user.id}`);
    };
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  // Prefetch discover cards when tab is first opened
  function openDiscover() {
    setMode("discover");
    // If background warm-up hasn't finished yet, still let the tab open.
    // The empty state "Reservoir refilling..." will show gracefully until
    // the prefetch useEffect completes.
    if (!discoverFetched && user) {
      discoverPrefetch(user.id)
        .then(({ words }) => { setDiscoverCards(words); setDiscoverFetched(true); })
        .catch(() => {});
    }
  }

  if (!user) return null;

  const dueTotal = reviewData?.due_count ?? 0;
  const dueRemaining = Math.max(0, dueTotal - reviewedCount);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="rounded-2xl border border-black/8 bg-white px-5 py-4 shadow-sm shadow-black/5 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers size={18} />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold text-text">Flashcards</h1>
              <p className="text-xs font-body text-text/50">
                {mode === "review"
                  ? dueTotal === 0 ? "No words due" : `${dueRemaining} due · ${reviewedCount} reviewed`
                  : `${discoverCards.length} available words`}
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-black/10 bg-black/[0.02] p-1 gap-1">
            {(["review", "discover"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={m === "discover" ? openDiscover : () => setMode("review")}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-heading font-semibold transition-all",
                  mode === m
                    ? "bg-white shadow text-primary border border-black/8"
                    : "text-text/50 hover:text-text",
                ].join(" ")}
              >
                {m === "review" ? <RotateCcw size={13} /> : <Sparkles size={13} />}
                {m === "review"
                  ? <>Review {dueTotal > 0 && <span className="ml-1 rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5">{dueRemaining}</span>}</>
                  : <>Discover {discoverCards.length > 0 && <span className="ml-1 rounded-full bg-violet-100 text-violet-600 text-[10px] px-1.5 py-0.5">{discoverCards.length}</span>}</>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {mode === "review" ? (
          <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ReviewMode
              loading={reviewLoading}
              error={reviewError}
              data={reviewData}
              userId={user.id}
              onHome={() => navigate("/home")}
              onReviewedChange={setReviewedCount}
            />
          </motion.div>
        ) : (
          <motion.div key="discover" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <DiscoverMode
              cards={discoverCards}
              userId={user.id}
              onCardConsumed={(wordId) =>
                setDiscoverCards((prev) => prev.filter((c) => c.wordId !== wordId))
              }
              onRefreshReview={fetchReview}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Review Mode ─────────────────────────────────────────────────────────────

function ReviewMode({
  loading, error, data, userId, onHome, onReviewedChange,
}: {
  loading: boolean;
  error: string | null;
  data: FlashcardsResponse | null;
  userId: string;
  onHome: () => void;
  onReviewedChange: (n: number) => void;
}) {
  // Local stack — includes "forgot" re-inserts
  const [stack,      setStack]      = useState<FlashcardItem[]>([]);
  const [stackReady, setStackReady] = useState(false);
  // reviewed = words successfully remembered this session (NOT incremented on forgot)
  const [reviewed,   setReviewed]   = useState(0);
  const [flipped,    setFlipped]    = useState(false);
  const [remembered, setRemembered] = useState<boolean | null>(null);
  const [interval,   setInterval]   = useState<ReviewInterval>(null);
  const [saving,     setSaving]     = useState(false);
  const [done,       setDone]       = useState(false);

  // Build stack when data arrives
  useEffect(() => {
    if (data) {
      setStack([...data.cards]);
      setStackReady(true);
    }
  }, [data]);

  // Propagate reviewed count up to parent for header
  useEffect(() => { onReviewedChange(reviewed); }, [reviewed, onReviewedChange]);

  const dueCount = data?.due_count ?? 0;
  const serverReviewed = data?.reviewed_today ?? 0;
  
  // Total daily task = what we have left to do + what we already did + what we did locally this session
  const totalDailyTask = dueCount + serverReviewed;
  const totalReviewed = serverReviewed + reviewed;

  // Progress bar: 0% = red, 1-99% = amber, 100% = green
  // If total task is 0, user has nothing to review today -> treat as complete (green)
  const progress = totalDailyTask === 0 ? 1 : Math.min(1, totalReviewed / totalDailyTask);
  const barPct   = Math.round(progress * 100);
  const barColor = totalDailyTask === 0 || barPct === 100
    ? "#10b981"   // green — all done
    : barPct <= 10
    ? "#ef4444"   // red — just started
    : "#f59e0b";  // amber — in progress

  const card = stack[0] ?? null;

  function handleRemember() {
    setRemembered(true);
    setFlipped(true);
  }

  function handleForgot() {
    if (!card) return;
    setRemembered(false);
    setFlipped(true);
    // Push to END of queue (not position 3) — user sees all other cards first
    setStack((prev) => {
      if (prev.length <= 1) return prev; // only card, keep it
      return [...prev.slice(1), prev[0]];
    });
    // Tell backend (non-blocking) — does NOT increment reviewed
    void submitFlashcardReview(userId, card.wordId, false).catch(() => {});
  }

  async function handleSchedule() {
    if (!card || interval === null) return;
    const opt = INTERVALS.find((o) => o.value === interval)!;
    setSaving(true);
    await submitFlashcardReview(userId, card.wordId, true, opt.days).catch(() => {});
    setSaving(false);
    // Only increment reviewed AFTER successful "I remember" + schedule
    setReviewed((n) => n + 1);
    setStack((prev) => prev.slice(1));   // remove from front
    setFlipped(false);
    setRemembered(null);
    setInterval(null);
    if (stack.length <= 1) setDone(true);
  }

  // Loading
  if (loading) return (
    <div className="flex flex-col items-center py-20">
      <Hourglass size={32} className="text-primary animate-pulse mb-3" />
      <p className="text-sm font-body text-text/50 animate-pulse">Loading your review deck…</p>
    </div>
  );

  if (error) return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
      <p className="text-sm font-heading font-semibold text-red-700 mb-4">{error}</p>
      <button type="button" onClick={onHome} className="rounded-xl border border-red-200 px-4 py-2 text-xs font-heading font-semibold text-red-700 hover:bg-red-100">Back home</button>
    </div>
  );

  // No words at all
  if (stackReady && stack.length === 0 && !done) return (
    <EmptyReview onHome={onHome} />
  );

  // Session complete
  if (done || (stackReady && stack.length === 0)) return (
    <DeckDone
      reviewed={reviewed}
      total={dueCount}
      onRestart={() => { setStack(data?.cards ? [...data.cards] : []); setDone(false); setReviewed(0); onReviewedChange(0); }}
      onHome={onHome}
    />
  );

  const examples = card?.examples ?? [];

  return (
    <div className="max-w-md mx-auto">
      {/* SRS Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs font-body text-text/50 mb-1.5">
          <span>{reviewed} reviewed today</span>
          <span>{dueCount === 0 ? "No words due" : `${Math.max(0, dueCount - reviewed)} remaining`}</span>
        </div>
        <div className="h-2.5 rounded-full bg-black/8 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: barColor }}
            animate={{ width: dueCount === 0 ? "100%" : `${barPct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        {(dueCount === 0 || barPct === 100) && (
          <p className="text-xs text-emerald-600 font-body font-semibold mt-1 text-right">All due reviews are complete.</p>
        )}
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={card?.wordId}
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.97 }}
          className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10"
        >
          {/* Word front */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
              <BookOpen size={22} />
            </div>
            <p className="text-xs font-body font-semibold text-text/40 uppercase tracking-widest mb-1">Dutch word</p>
            <div className="flex items-center justify-center gap-2">
              <h2 className="font-heading text-3xl font-bold text-text">{card?.dutch}</h2>
              {card?.dutch && (
                <SpeakButton
                  text={card.dutch}
                  label={`Play pronunciation for ${card.dutch}`}
                  className="h-9 w-9 shrink-0"
                />
              )}
            </div>
            <p className="text-xs font-body text-text/35 mt-2">
              {stack.length - 1 > 0 ? `${stack.length - 1} more in queue` : "Last card"}
            </p>
          </div>

          {/* Front action buttons */}
          {!flipped && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleForgot}
                className="flex-1 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-heading font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                I forgot
              </button>
              <button
                type="button"
                onClick={handleRemember}
                className="flex-1 rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-heading font-semibold hover:opacity-90 transition-opacity"
              >
                I remember
              </button>
            </div>
          )}

          {/* Flipped content */}
          <AnimatePresence>
            {flipped && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="border-t border-black/6 pt-5 mb-4">
                  <p className="text-xs font-body font-semibold text-text/40 uppercase tracking-widest mb-1">Meaning</p>
                  <p className="font-heading text-lg font-bold text-primary">{card?.english}</p>
                </div>

                {examples.length > 0 && (
                  <div className="space-y-2 mb-5">
                    {examples.slice(0, 2).map((ex, i) => (
                      <div key={i} className="bg-black/[0.025] rounded-xl px-4 py-3">
                        <p className="text-sm font-body text-text font-medium">{ex.nl}</p>
                        <p className="text-xs font-body text-text/50 mt-0.5">{ex.en}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Interval selector — only when remembered */}
                {remembered === true && (
                  <>
                    <p className="text-xs font-body font-semibold text-text/50 mb-2">Review again in:</p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {INTERVALS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setInterval(opt.value)}
                          className={[
                            "px-3 py-1 rounded-full text-xs font-body font-semibold border transition-all",
                            interval === opt.value
                              ? "bg-primary text-white border-primary"
                              : "border-black/12 text-text/60 hover:border-black/25",
                          ].join(" ")}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSchedule()}
                      disabled={interval === null || saving}
                      className="w-full rounded-xl bg-primary text-white py-2.5 text-sm font-heading font-semibold hover:opacity-90 disabled:opacity-40"
                    >
                      Schedule review
                    </button>
                  </>
                )}

                {/* Forgot — just show "Got it, next!" */}
                {remembered === false && (
                  <div className="text-center mt-2">
                    <p className="text-xs font-body text-amber-600 font-semibold mb-3">
                      This card will come back later in this session.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setFlipped(false); setRemembered(null); }}
                      className="rounded-xl border border-black/12 px-5 py-2 text-sm font-heading font-semibold text-text hover:bg-black/[0.03]"
                    >
                      Continue
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Discover Mode ────────────────────────────────────────────────────────────

function DiscoverMode({
  cards, userId, onCardConsumed, onRefreshReview,
}: {
  cards: DiscoverCard[];
  userId: string;
  onCardConsumed: (wordId: string) => void;
  onRefreshReview: () => void;
}) {
  const [flipped,   setFlipped]   = useState(false);
  const [interval,  setInterval]  = useState<ReviewInterval>(null);
  const [saving,    setSaving]    = useState(false);

  const card = cards[0] ?? null;

  // Reset flip when card changes
  const prevWordId = useRef<string | null>(null);
  useEffect(() => {
    if (card?.wordId !== prevWordId.current) {
      setFlipped(false);
      setInterval(null);
      prevWordId.current = card?.wordId ?? null;
    }
  }, [card]);

  async function handleKnown() {
    if (!card) return;
    setSaving(true);
    await markKnownFlashcard(userId, card.wordId).catch(() => {});
    setSaving(false);
    onCardConsumed(card.wordId);
  }

  async function handleLearn() {
    setFlipped(true);
  }

  async function handleAddToLearn() {
    if (!card || interval === null) return;
    const opt = INTERVALS.find((o) => o.value === interval)!;
    setSaving(true);
    await addDiscoveredToLearn(userId, card.wordId, opt.days).catch(() => {});
    setSaving(false);
    onCardConsumed(card.wordId);

    if (opt.days === 0) {
      onRefreshReview();
    }
  }

  if (!card) return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 mx-auto">
        <Sparkles size={26} className="text-violet-400" strokeWidth={1.6} />
      </div>
      <h2 className="font-heading text-xl font-bold text-text mb-3">
        You've discovered all current recommendations!
      </h2>
      <p className="text-sm font-body text-text/55 leading-relaxed mb-8">
        Now is a great time to do some <span className="font-semibold text-primary">Readings</span> to
        see these words in context and practice what you've learned.
      </p>
      <button
        type="button"
        onClick={() => window.location.assign("/reading")}
        className="rounded-xl bg-primary text-white px-5 py-2.5 text-sm font-heading font-semibold hover:opacity-90"
      >
        Go to Reading 📖
      </button>
    </div>
  );

  const examples = card.examples ?? [];

  return (
    <div className="max-w-md mx-auto">
      {/* Counter */}
      <div className="flex justify-between text-xs font-body text-text/50 mb-4">
        <span className="flex items-center gap-1.5"><Sparkles size={12} /> Discover mode</span>
        <span>{cards.length} words left</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={card.wordId}
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.97 }}
          className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10"
        >
          {/* Word */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-50 text-violet-600 mb-4">
              <Sparkles size={22} />
            </div>
            {card.cefrLevel && (
              <span className="inline-block mb-2 text-[10px] font-heading font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                {card.cefrLevel}
              </span>
            )}
            <p className="text-xs font-body font-semibold text-text/40 uppercase tracking-widest mb-1">New word</p>
            <div className="flex items-center justify-center gap-2">
              <h2 className="font-heading text-3xl font-bold text-text">{card.dutch}</h2>
              <SpeakButton
                text={card.dutch}
                label={`Play pronunciation for ${card.dutch}`}
                className="h-9 w-9 shrink-0"
              />
            </div>
          </div>

          {/* Pre-flip actions */}
          {!flipped && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleKnown()}
                disabled={saving}
                className="flex-1 rounded-xl border border-black/12 px-4 py-2.5 text-sm font-heading font-semibold text-text/70 hover:bg-black/[0.03] disabled:opacity-50"
              >
                I know this word
              </button>
              <button
                type="button"
                onClick={() => void handleLearn()}
                className="flex-1 rounded-xl bg-violet-600 text-white px-4 py-2.5 text-sm font-heading font-semibold hover:opacity-90"
              >
                Add to review
              </button>
            </div>
          )}

          {/* Flipped — show meaning + interval picker */}
          <AnimatePresence>
            {flipped && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="border-t border-black/6 pt-5 mb-4">
                  <p className="text-xs font-body font-semibold text-text/40 uppercase tracking-widest mb-1">Meaning</p>
                  <p className="font-heading text-lg font-bold text-violet-600">{card.english}</p>
                </div>

                {examples.length > 0 && (
                  <div className="space-y-2 mb-5">
                    {examples.slice(0, 2).map((ex, i) => (
                      <div key={i} className="bg-black/[0.025] rounded-xl px-4 py-3">
                        <p className="text-sm font-body text-text font-medium">{ex.nl}</p>
                        <p className="text-xs font-body text-text/50 mt-0.5">{ex.en}</p>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs font-body font-semibold text-text/50 mb-2">First review in:</p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {INTERVALS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setInterval(opt.value)}
                      className={[
                        "px-3 py-1 rounded-full text-xs font-body font-semibold border transition-all",
                        interval === opt.value
                          ? "bg-violet-600 text-white border-violet-600"
                          : "border-black/12 text-text/60 hover:border-black/25",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => void handleAddToLearn()}
                  disabled={interval === null || saving}
                  className="w-full rounded-xl bg-violet-600 text-white py-2.5 text-sm font-heading font-semibold hover:opacity-90 disabled:opacity-40"
                >
                  <Check size={14} className="inline mr-1.5" />
                  Add to word review
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-states ───────────────────────────────────────────────────────────────

function EmptyReview({ onHome }: { onHome: () => void }) {
  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 mx-auto">
        <Check size={28} className="text-emerald-500" strokeWidth={1.8} />
      </div>
      <h2 className="font-heading text-xl font-bold text-text mb-2">No words due today</h2>
      <p className="text-sm font-body text-text/50 mb-8">
        You do not have any words to review yet. Add words from readings or switch to Discover mode.
      </p>
      <button type="button" onClick={onHome}
        className="rounded-xl border border-black/12 px-5 py-2.5 text-sm font-heading font-semibold text-text hover:bg-black/[0.03]">
        Back home
      </button>
    </div>
  );
}

function DeckDone({
  reviewed, total, onRestart, onHome,
}: { reviewed: number; total: number; onRestart: () => void; onHome: () => void }) {
  const pct = total === 0 ? 100 : Math.round((reviewed / total) * 100);
  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 mx-auto">
        <Check size={28} className="text-emerald-500" strokeWidth={1.8} />
      </div>
      <h2 className="font-heading text-xl font-bold text-text mb-1">Session complete!</h2>
      <p className="text-2xl font-heading font-black text-emerald-600 mb-1">{pct}%</p>
      <p className="text-sm font-body text-text/50 mb-8">
        {reviewed} of {total} due cards reviewed.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={onRestart}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-black/12 px-5 py-2.5 text-sm font-heading font-semibold text-text hover:bg-black/[0.03]">
          <RotateCcw size={13} /> Study again
        </button>
        <button type="button" onClick={onHome}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-white px-5 py-2.5 text-sm font-heading font-semibold hover:opacity-90">
          <Home size={13} /> Home
        </button>
      </div>
    </div>
  );
}
