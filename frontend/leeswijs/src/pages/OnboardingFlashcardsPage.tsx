import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, BookOpen } from "lucide-react";
import { getOnboardingWords, addToLearnList, completeOnboarding, markKnown, selectOnboardingWords } from "../services/api";
import { useStore } from "../store";
import type { LexiconEntry } from "../types";
import SpeakButton from "../components/SpeakButton";

export default function OnboardingFlashcardsPage() {
  const navigate = useNavigate();
  const user     = useStore((s) => s.user);
  const setUser  = useStore((s) => s.setUser);

  const [words,      setWords]      = useState<LexiconEntry[]>([]);
  const [index,      setIndex]      = useState(0);
  const [flipped,    setFlipped]    = useState(false);
  const [done,       setDone]       = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [advancing,  setAdvancing]  = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [, setKnowCount] = useState(0);
  const [refilling,  setRefilling]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    getOnboardingWords(user.id)
      .catch(() => selectOnboardingWords(user.id))
      .then((ws) => {
        if (ws.length === 0) {
          throw new Error("No onboarding words were prepared.");
        }
        setWords(ws);
      })
      .catch(() => setError("Could not load onboarding words."))
      .finally(() => setLoading(false));
  }, [user]);

  const word = words[index] ?? null;

  function handleKnow() {
    if (!user || !word || advancing) return;
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
    
    advanceCard();
  }

  function handleAddToLearn() {
    if (!user || !word || saving || advancing) return;
    setSaving(true);
    void addToLearnList(user.id, word.word_id).finally(() => setSaving(false));
    advanceCard();
  }

  function advanceCard() {
    setAdvancing(true);
    setFlipped(false);
    
    const newCount = completedCount + 1;
    setCompletedCount(newCount);

    if (newCount >= 7) {
      setDone(true);
      return;
    }
    
    const nextIndex = index + 1;
    setIndex(nextIndex);
    
    if (nextIndex >= words.length && newCount < 7 && !refilling && user) {
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

    window.setTimeout(() => setAdvancing(false), 250);
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

  if (error || !word) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10 text-center">
        <div className="animate-spin w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary mx-auto mb-5" />
        <h2 className="font-heading text-xl font-bold text-text mb-2">
          Preparing your words
        </h2>
        <p className="text-sm font-body text-text/50 mb-6">
          {error ?? "A few more words are being prepared for this step."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 bg-primary text-white rounded-xl px-6 py-3 text-sm font-heading font-semibold hover:opacity-90"
        >
          Try again
        </button>
      </div>
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
        <span>[{completedCount}/7 completed]</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/8 overflow-hidden mb-6">
        <motion.div
          className="h-full rounded-full bg-primary"
          animate={{ width: `${(completedCount / 7) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Card */}
        <motion.div
          key={`${index}-${word.word_id}`}
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16 }}
          className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10"
        >
          {/* Front: Dutch word */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
              <BookOpen size={22} />
            </div>
            <p className="text-xs font-body font-semibold text-text/40 uppercase tracking-widest mb-1">Dutch word</p>
            <div className="flex items-center justify-center gap-2">
              <h2 className="font-heading text-3xl font-bold text-text break-words">{word?.word}</h2>
              <SpeakButton
                text={word?.word ?? ""}
                label={`Play Dutch pronunciation for ${word?.word ?? "this word"}`}
                className="h-9 w-9 shrink-0"
              />
            </div>
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

                <button
                  type="button"
                  onClick={() => void handleAddToLearn()}
                  disabled={saving || advancing}
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
                disabled={advancing}
                className="flex-1 rounded-xl border border-black/12 px-4 py-2.5 text-sm font-heading font-semibold text-text/70 hover:bg-black/[0.03] transition-colors disabled:opacity-50"
              >
                I know it
              </button>
              <button
                type="button"
                onClick={() => setFlipped(true)}
                disabled={advancing}
                className="flex-1 rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-heading font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Add to learn
              </button>
            </div>
          )}
        </motion.div>
    </motion.div>
  );
}
