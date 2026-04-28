import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, ClipboardCheck, Sparkles } from "lucide-react";

import TestComplete from "../components/vocab-test/TestComplete";
import TestProgress from "../components/vocab-test/TestProgress";
import TestQuestion from "../components/vocab-test/TestQuestion";
import { getVocabTest, submitVocabTestResult } from "../services/api";
import type {
  VocabTest,
  VocabTestAnswer,
  VocabTestPhase,
  VocabTestResult,
} from "../types";

export default function VocabTestPage() {
  const { sessionId = "session-001" } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const phase: VocabTestPhase =
    searchParams.get("phase") === "delayed" ? "DELAYED_24H" : "IMMEDIATE";

  const [test, setTest] = useState<VocabTest | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, VocabTestAnswer>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VocabTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getVocabTest(sessionId, phase)
      .then((res) => {
        if (cancelled) return;
        if (res.success) setTest(res.data);
        else setError(res.error ?? "Could not load the vocabulary test.");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the vocabulary test.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, phase]);

  const currentQuestion = test?.questions[index] ?? null;
  const selectedIndex = currentQuestion
    ? answers[currentQuestion.questionId]?.selectedIndex ?? null
    : null;

  const correct = useMemo(
    () => Object.values(answers).filter((answer) => answer.isCorrect).length,
    [answers]
  );

  function handleSelect(selected: number) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.questionId]: {
        questionId: currentQuestion.questionId,
        wordId: currentQuestion.wordId,
        selectedIndex: selected,
        isCorrect: selected === currentQuestion.correctIndex,
      },
    }));
  }

  async function handleNext() {
    if (!test || !currentQuestion || selectedIndex === null) return;
    const isLast = index === test.questions.length - 1;
    if (!isLast) {
      setIndex((n) => n + 1);
      return;
    }

    const nextResult: VocabTestResult = {
      sessionId: test.sessionId,
      phase: test.phase,
      answers: Object.values(answers),
      correct,
      total: test.questions.length,
      submittedAt: new Date().toISOString(),
    };

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitVocabTestResult(nextResult);
      if (!res.success) throw new Error(res.error ?? "Could not submit the test.");
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the test.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetTest() {
    setIndex(0);
    setAnswers({});
    setResult(null);
    setError(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <div className="inline-flex items-center gap-2 text-sm font-body text-text/60">
          <Sparkles size={16} className="animate-pulse" />
          Loading vocabulary test…
        </div>
      </div>
    );
  }

  if (!test || !currentQuestion) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
        <div className="flex gap-3">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <p className="text-sm font-body text-red-700">
            {error ?? "No vocabulary check is available for this reading yet."}
          </p>
        </div>
      </div>
    );
  }

  const isLast = index === test.questions.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-2xl"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardCheck size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">
            Vocabulary Check
          </h1>
          <p className="text-sm font-body text-text/50">
            {phase === "DELAYED_24H"
              ? "Delayed check for the words from your reading."
              : "Check a few target words from this reading."}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white px-7 py-8 shadow-xl shadow-black/8">
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <TestComplete
                correct={result.correct}
                total={result.total}
                phase={result.phase}
                continueLabel="Finish"
                onContinue={() => navigate("/home")}
                onRetry={resetTest}
              />
            </motion.div>
          ) : (
            <motion.div
              key={currentQuestion.questionId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="space-y-7"
            >
              <TestProgress current={index + 1} total={test.questions.length} />
              <TestQuestion
                word={currentQuestion.dutch}
                prompt={currentQuestion.prompt}
                options={currentQuestion.options}
                selectedIndex={selectedIndex}
                onSelect={handleSelect}
              />

              {error && (
                <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
                  <p className="text-sm font-body text-red-700">{error}</p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleNext}
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
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
