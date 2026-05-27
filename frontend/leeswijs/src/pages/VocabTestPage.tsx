import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, ClipboardCheck, Home, Loader2 } from "lucide-react";

import TestProgress from "../components/vocab-test/TestProgress";
import TestQuestion from "../components/vocab-test/TestQuestion";
import { startVocabTest, submitVocabTest } from "../services/api";
import { useStore } from "../store";
import type { VocabTestQuestion, VocabTestAnswer } from "../types";

interface LocalAnswer {
  questionId: string;
  wordId: string;
  selectedIndex: number;
  isCorrect: boolean;
  chosenAnswer: string;
}

export default function VocabTestPage() {
  const { sessionGroupId = "1" } = useParams<{ sessionGroupId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user    = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);

  const sgId = parseInt(sessionGroupId, 10);
  // studyPhase comes from ?phase=1|2 query param (defaults to 1)
  const studyPhase = parseInt(searchParams.get("phase") ?? "1", 10);
  const isFinal    = studyPhase === 2;

  const [questions,  setQuestions]  = useState<VocabTestQuestion[]>([]);
  const [index,      setIndex]      = useState(0);
  const [answers,    setAnswers]    = useState<Record<string, LocalAnswer>>({});
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [done,       setDone]       = useState(false);
  const [score,      setScore]      = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    startVocabTest(user.id, sgId, studyPhase)
      .then((res) => {
        if (res.success) {
          setQuestions(res.data.questions);
        } else {
          setError(res.error ?? "Could not load vocabulary test.");
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load vocabulary test."),
      )
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionGroupId, studyPhase]);

  const currentQuestion = questions[index] ?? null;
  const selectedIndex   = currentQuestion ? answers[currentQuestion.questionId]?.selectedIndex ?? null : null;

  const correct = useMemo(
    () => Object.values(answers).filter((a) => a.isCorrect).length,
    [answers],
  );

  function handleSelect(selected: number) {
    if (!currentQuestion) return;
    const isCorrect = selected === currentQuestion.correctIndex;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.questionId]: {
        questionId:    currentQuestion.questionId,
        wordId:        currentQuestion.wordId,
        selectedIndex: selected,
        isCorrect,
        chosenAnswer:  currentQuestion.options[selected] ?? "",
      },
    }));
  }

  async function handleNext() {
    if (!user || !currentQuestion || selectedIndex === null) return;
    const isLast = index === questions.length - 1;

    if (!isLast) {
      setIndex((n) => n + 1);
      return;
    }

    // Submit
    const allAnswers: VocabTestAnswer[] = Object.values(answers).map((a) => ({
      word_id:       a.wordId,
      chosen_answer: a.chosenAnswer,
      is_correct:    a.isCorrect,
    }));

    setSubmitting(true);
    setError(null);
    try {
      const result = await submitVocabTest(user.id, sgId, allAnswers, correct, studyPhase, isFinal);
      setScore(correct);
      setDone(true);

      // Update user object in store with flipped condition (if applicable)
      if (result.new_condition && user) {
        setUser({ ...user, current_condition: result.new_condition, has_switched_conditions: true });
      }

      // Route based on backend instruction
      if (result.next_action === "transition") {
        // Short delay so the user sees their score before transition
        setTimeout(() => navigate("/system-transition"), 2200);
      } else if (result.next_action === "finish") {
        // Stay on done screen — /thank-you will be shown after 2s
        setTimeout(() => navigate("/thank-you"), 2200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit test.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <div className="inline-flex items-center gap-2 text-sm font-body text-text/60">
          <Loader2 size={16} className="animate-spin" />
          Loading vocabulary test…
        </div>
      </div>
    );
  }

  if (error && questions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 px-5 py-4">
        <div className="flex gap-3">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <div>
            <h1 className="font-heading text-sm font-semibold text-red-700">Could not load vocabulary test</h1>
            <p className="mt-1 text-sm font-body text-red-700/80">{error}</p>
            <button type="button" onClick={() => navigate("/home")}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-heading font-semibold text-red-700 hover:bg-red-100">
              <Home size={13} /> Back home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10 text-center"
      >
        <div className="text-5xl mb-4">{score >= questions.length * 0.6 ? "🎉" : "📚"}</div>
        <h2 className="font-heading text-2xl font-bold text-text mb-1">Test complete!</h2>
        <p className="text-sm font-body text-text/55 mb-2">
          You got <span className="font-semibold text-primary">{score}</span> out of <span className="font-semibold">{questions.length}</span> correct.
        </p>
        <p className="text-xs font-body text-text/40 mb-8">Your results have been saved. Thank you for participating!</p>
        <button type="button" onClick={() => navigate("/home")}
          className="inline-flex items-center gap-2 bg-primary text-white rounded-xl px-6 py-3 text-sm font-heading font-semibold hover:opacity-90">
          <Home size={15} /> Back to dashboard <ArrowRight size={14} />
        </button>
      </motion.div>
    );
  }

  const isLast = index === questions.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl"
    >
      {/* Header */}
      <div className="mb-5 rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck size={18} strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold text-text">Vocabulary test</h1>
            <p className="text-sm font-body text-text/50">
              How well do you remember the 7 words from before the readings?
            </p>
          </div>
        </div>
      </div>

      {/* Question card */}
      <div className="rounded-lg border border-black/8 bg-white px-6 py-7 shadow-sm shadow-black/5 space-y-7">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion?.questionId}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="space-y-7"
          >
            <TestProgress current={index + 1} total={questions.length} />

            {currentQuestion && (
              <TestQuestion
                word={currentQuestion.dutch}
                prompt={currentQuestion.prompt}
                options={currentQuestion.options}
                selectedIndex={selectedIndex}
                onSelect={handleSelect}
              />
            )}

            {error && (
              <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-sm font-body text-red-700">{error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleNext()}
                disabled={selectedIndex === null || submitting}
                className={[
                  "inline-flex items-center gap-2 rounded-xl px-5 py-3",
                  "text-sm font-heading font-semibold transition-opacity",
                  selectedIndex !== null && !submitting
                    ? "bg-primary text-white hover:opacity-90"
                    : "bg-black/8 text-text/40 cursor-not-allowed",
                ].join(" ")}
              >
                {submitting ? "Submitting…" : isLast ? "Finish test" : "Next word"}
                {!submitting && <ArrowRight size={16} strokeWidth={2.5} />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
