import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, BookOpen } from "lucide-react";
import { getOnboardingWords, addToLearnList, completeOnboarding, markKnown, selectOnboardingWords } from "../services/api";
import { useStore } from "../store";
import type { LexiconEntry } from "../types";
import SpeakButton from "../components/SpeakButton";

const TARGET_WORDS = 10;
const READINGS_PER_PHASE = 3;

export default function OnboardingFlashcardsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user     = useStore((s) => s.user);
  const setUser  = useStore((s) => s.setUser);

  const studyPhase = parseInt(searchParams.get("phase") ?? "1", 10);
  const firstReading = (studyPhase - 1) * READINGS_PER_PHASE + 1;
  const readingRange = `${firstReading}-${firstReading + READINGS_PER_PHASE - 1}`;

  const [words,      setWords]      = useState<LexiconEntry[]>([]);
  const [index,      setIndex]      = useState(0);
  const [done,       setDone]       = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [learningCount, setLearningCount] = useState(0);
  const [refilling,  setRefilling]  = useState(false);

  function mergeUnique(current: LexiconEntry[], incoming: LexiconEntry[]) {
    const seen = new Set(current.map((w) => w.word_id));
    return [...current, ...incoming.filter((w) => !seen.has(w.word_id))];
  }

  async function refillWords() {
    if (!user || refilling) return;
    setRefilling(true);
    try {
      const refillWords = await selectOnboardingWords(user.id, true, studyPhase);
      setWords((prev) => mergeUnique(prev, refillWords));
    } finally {
      setRefilling(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    getOnboardingWords(user.id, studyPhase)
      .catch(() => selectOnboardingWords(user.id, false, studyPhase))
      .then(async (ws) => {
        let nextWords = ws;
        if (nextWords.length < TARGET_WORDS) {
          const refillWords = await selectOnboardingWords(user.id, true, studyPhase).catch(() => []);
          const existingIds = new Set(nextWords.map((w) => w.word_id));
          nextWords = [...nextWords, ...refillWords.filter((w) => !existingIds.has(w.word_id))];
        }
        setWords(nextWords);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user, studyPhase]);

  const word = words[index] ?? null;

  async function handleKnow() {
    if (!user || !word) return;
    setSaving(true);
    await markKnown(user.id, word.word_id).catch(() => undefined);
    setSaving(false);
    advanceCard(false);
  }

  async function handleAddToLearn() {
    if (!user || !word) return;
    setSaving(true);
    await addToLearnList(user.id, word.word_id).catch(() => undefined);
    setSaving(false);
    advanceCard(true);
  }

  function advanceCard(isLearning: boolean) {
    const newCount = isLearning ? learningCount + 1 : learningCount;
    if (isLearning) {
      setLearningCount(newCount);
    }

    if (newCount >= TARGET_WORDS) {
      setDone(true);
      return;
    }
    
    const nextIndex = index + 1;
    setIndex(nextIndex);
    
    if (words.length - nextIndex < 5 && !refilling && user) {
      void refillWords();
    }
  }

  async function handleFinish() {
    if (!user) return;
    window.localStorage.setItem(`leeswijs-word-set-ready-${user.id}-${studyPhase}`, "true");

    if (studyPhase === 1) {
      await completeOnboarding(user.id).catch(() => undefined);
      setUser({ ...user, onboarding_completed: true });
      navigate("/reading", { replace: true });
    } else {
      navigate("/reading", { replace: true });
    }
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
        <h2 className="font-heading text-xl font-bold text-text mb-2">Word set ready</h2>
        <p className="text-sm font-body text-text/50 mb-8">
          {studyPhase === 1
            ? `Readings ${readingRange} are ready.`
            : `Readings ${readingRange} are now unlocked.`}
        </p>
        <button
          type="button"
          onClick={() => void handleFinish()}
          className="inline-flex items-center gap-2 bg-primary text-white rounded-xl px-6 py-3 text-sm font-heading font-semibold hover:opacity-90"
        >
          {studyPhase === 1 ? "Start reading" : "Continue reading"} <ArrowRight size={16} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto"
    >
      <div className="mb-4 flex items-center justify-between text-xs font-body text-text/50">
        <span>Phase {studyPhase} word set: select {TARGET_WORDS} words</span>
        <span>[{learningCount}/{TARGET_WORDS} completed]</span>
      </div>
      <p className="mb-3 text-xs font-body text-text/45">
        Select {TARGET_WORDS} target words to unlock readings {readingRange}.
      </p>
      <div className="h-1.5 rounded-full bg-black/8 overflow-hidden mb-6">
        <motion.div
          className="h-full rounded-full bg-primary"
          animate={{ width: `${(learningCount / TARGET_WORDS) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      {refilling && (
        <p className="mb-3 text-center text-xs font-body text-text/45">
          Finding another word...
        </p>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={word?.word_id}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.97 }}
          className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
              <BookOpen size={22} />
            </div>
            <p className="text-xs font-body font-semibold text-text/40 uppercase tracking-widest mb-1">Dutch word</p>
            <div className="flex items-center justify-center gap-2">
              <h2 className="font-heading text-3xl font-bold text-text">
                {word?.word ?? "Finding another word..."}
              </h2>
              {word?.word && (
                <SpeakButton
                  text={word.word}
                  label={`Play pronunciation for ${word.word}`}
                  className="h-9 w-9 shrink-0"
                />
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={() => void handleKnow()}
              disabled={!word || saving}
              className="flex-1 rounded-xl border border-black/12 px-4 py-2.5 text-sm font-heading font-semibold text-text/70 hover:bg-black/[0.03] transition-colors disabled:opacity-50"
            >
              I know this word
            </button>
            <button
              type="button"
              onClick={() => void handleAddToLearn()}
              disabled={!word || saving}
              className="flex-1 rounded-xl bg-primary text-white px-4 py-2.5 text-sm font-heading font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Add to learn
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
