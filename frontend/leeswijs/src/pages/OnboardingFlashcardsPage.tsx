import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, BookOpen } from "lucide-react";
import { getOnboardingWords, addToLearnList, completeOnboarding, markKnown, selectOnboardingWords } from "../services/api";
import { useStore } from "../store";
import type { LexiconEntry, ReviewInterval } from "../types";

const REVIEW_OPTIONS: { label: string; value: ReviewInterval; days?: number }[] = [
  { label: "Today",   value: "today",  days: 0 },
  { label: "1 day",   value: "1d",     days: 1 },
  { label: "2 days",  value: "2d",     days: 2 },
  { label: "4 days",  value: "4d",     days: 4 },
  { label: "1 week",  value: "1w",     days: 7 },
  { label: "1 month", value: "1m",     days: 30 },
];

export default function OnboardingFlashcardsPage() {
  const navigate = useNavigate();
  const user     = useStore((s) => s.user);
  const setUser  = useStore((s) => s.setUser);

  const [words,      setWords]      = useState<LexiconEntry[]>([]);
  const [index,      setIndex]      = useState(0);
  const [flipped,    setFlipped]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [interval,   setInterval]   = useState<ReviewInterval>(null);
  const [saving,     setSaving]     = useState(false);
  const [learningCount, setLearningCount] = useState(0);
  const [, setKnowCount] = useState(0);
  const [refilling,  setRefilling]  = useState(false);

  useEffect(() => {
    if (!user) return;
    getOnboardingWords(user.id).then((ws) => {
      setWords(ws);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const word = words[index] ?? null;

  function handleKnow() {
    if (!user || !word) return;
    void markKnown(user.id, word.word_id).catch(() => {});
    
    setKnowCount((prev) => {
      const next = prev + 1;
      if (next % 10 === 0 && !refilling) {
        setRefilling(true);
        // Call with isRefill = true
        selectOnboardingWords(user.id, true).then((newWords) => {
          setWords((prevWords) => {
            const existingIds = new Set(prevWords.map(w => w.word_id));
            const uniqueNew = newWords.filter(w => !existingIds.has(w.word_id));
            return [...prevWords, ...uniqueNew];
          });
          setRefilling(false);
        }).catch(() => setRefilling(false));
      }
      return next;
    });
    
    advanceCard(false);
  }

  async function handleAddToLearn() {
    if (!user || !word) return;
    setSaving(true);
    await addToLearnList(user.id, word.word_id, interval ? REVIEW_OPTIONS.find((r) => r.value === interval)?.days : undefined).catch(() => {});
    setSaving(false);
    advanceCard(true);
  }

  function advanceCard(isLearning: boolean) {
    setFlipped(false);
    setInterval(null);
    
    const newCount = isLearning ? learningCount + 1 : learningCount;
    if (isLearning) {
      setLearningCount(newCount);
    }

    if (newCount >= 7) {
      setDone(true);
      return;
    }
    
    const nextIndex = index + 1;
    setIndex(nextIndex);
    
    // Background refill based on buffer size
    if (words.length - nextIndex < 5 && !refilling && user) {
      setRefilling(true);
      selectOnboardingWords(user.id, false).then((newWords) => {
        setWords((prev) => {
          const existingIds = new Set(prev.map(w => w.word_id));
          const uniqueNew = newWords.filter(w => !existingIds.has(w.word_id));
          return [...prev, ...uniqueNew];
        });
        setRefilling(false);
      }).catch(() => setRefilling(false));
    }
  }

  async function handleFinish() {
    if (!user) return;
    await completeOnboarding(user.id).catch(() => {});
    setUser({ ...user, onboarding_completed: true });
    navigate("/home", { replace: true });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-md mx-auto bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10 text-center"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 mx-auto">
          <Check size={28} className="text-emerald-600" strokeWidth={1.8} />
        </div>
        <h2 className="font-heading text-xl font-bold text-text mb-2">Words reviewed!</h2>
        <p className="text-sm font-body text-text/50 mb-8">
          Great start. Let's head to your reading dashboard.
        </p>
        <button
          type="button"
          onClick={() => void handleFinish()}
          className="inline-flex items-center gap-2 bg-primary text-white rounded-xl px-6 py-3 text-sm font-heading font-semibold hover:opacity-90"
        >
          Go to dashboard <ArrowRight size={16} />
        </button>
      </motion.div>
    );
  }

  const examples = (word?.examples as Array<{ nl: string; en: string }> | null) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto"
    >
      {/* Progress */}
      <div className="mb-4 flex items-center justify-between text-xs font-body text-text/50">
        <span>Mastering your first 7 words...</span>
        <span>[{learningCount}/7 completed]</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/8 overflow-hidden mb-6">
        <motion.div
          className="h-full rounded-full bg-primary"
          animate={{ width: `${(learningCount / 7) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={word?.word_id}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10"
        >
          {/* Front: Dutch word */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
              <BookOpen size={22} />
            </div>
            <p className="text-xs font-body font-semibold text-text/40 uppercase tracking-widest mb-1">Dutch word</p>
            <h2 className="font-heading text-3xl font-bold text-text">{word?.word}</h2>
          </div>

          {/* Back: translation + examples (shown after flip) */}
          <AnimatePresence>
            {flipped && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="border-t border-black/6 pt-5 mb-5">
                  <p className="text-xs font-body font-semibold text-text/40 uppercase tracking-widest mb-1">Meaning</p>
                  <p className="font-heading text-lg font-bold text-primary">{word?.translation}</p>
                </div>

                {examples.length > 0 && (
                  <div className="space-y-3 mb-5">
                    {examples.slice(0, 3).map((ex, i) => (
                      <div key={i} className="bg-black/[0.025] rounded-xl px-4 py-3">
                        <p className="text-sm font-body text-text font-medium">{ex.nl}</p>
                        <p className="text-xs font-body text-text/50 mt-0.5">{ex.en}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mb-5">
                  <p className="text-xs font-body font-semibold text-text/50 mb-2">Review again in:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REVIEW_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setInterval(opt.value)}
                        className={["px-3 py-1 rounded-full text-xs font-body font-semibold border transition-all",
                          interval === opt.value ? "bg-primary text-white border-primary" : "border-black/12 text-text/60 hover:border-black/25"].join(" ")}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleAddToLearn()}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-heading font-semibold hover:opacity-90 disabled:opacity-60"
                >
                  Add to learn list <ArrowRight size={15} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buttons */}
          {!flipped && (
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={handleKnow}
                className="flex-1 rounded-xl border border-black/12 px-4 py-2.5 text-sm font-heading font-semibold text-text/70 hover:bg-black/[0.03] transition-colors"
              >
                I know it ✓
              </button>
              <button
                type="button"
                onClick={() => setFlipped(true)}
                className="flex-1 rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-heading font-semibold hover:opacity-90 transition-opacity"
              >
                Add to learn
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
