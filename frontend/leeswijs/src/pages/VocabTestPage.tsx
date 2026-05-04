import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, ArrowRight, ClipboardCheck, Home, Loader2 } from "lucide-react";

import TestComplete from "../components/vocab-test/TestComplete";
import TestProgress from "../components/vocab-test/TestProgress";
import TestQuestion from "../components/vocab-test/TestQuestion";
import {
  getVocabTest,
  isBackendNotReadyMessage,
  submitVocabTestResult,
} from "../services/api";
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
          <Loader2 size={16} className="animate-spin" />
          Loading vocabulary test…
        </div>
      </div>
    );
  }

  if (!test || !currentQuestion) {
    const backendNotReady = isBackendNotReadyMessage(error);
    return (
      <div
        className={[
          "mx-auto max-w-2xl rounded-lg border px-5 py-4",
          backendNotReady
            ? "border-black/8 bg-white"
            : "border-red-200 bg-red-50",
        ].join(" ")}
      >
        <div className="flex gap-3">
          <AlertCircle
            size={18}
            className={[
              "mt-0.5 shrink-0",
              backendNotReady ? "text-text/35" : "text-red-500",
            ].join(" ")}
          />
          <div>
            <h1
              className={[
                "font-heading text-sm font-semibold",
                backendNotReady ? "text-text" : "text-red-700",
              ].join(" ")}
            >
              {backendNotReady
                ? "Vocabulary check is not connected yet"
                : "Could not load vocabulary check"}
            </h1>
            <p
              className={[
                "mt-1 text-sm font-body",
                backendNotReady ? "text-text/55" : "text-red-700/80",
              ].join(" ")}
            >
              {backendNotReady
                ? "This vocabulary check is waiting for backend support. You can go back and continue testing the reading flow."
                : error ?? "No vocabulary check is available for this reading yet."}
            </p>
            <button
              type="button"
              onClick={() => navigate("/home")}
              className={[
                "mt-4 inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-heading font-semibold",
                backendNotReady
                  ? "border-black/12 text-text/70 hover:bg-black/[0.03]"
                  : "border-red-200 text-red-700 hover:bg-red-100",
              ].join(" ")}
            >
              <Home size={13} />
              Back home
            </button>
          </div>
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
      <div className="mb-5 rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardCheck size={18} strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold text-text">
                Vocabulary check
              </h1>
              <p className="text-sm font-body text-text/50">
                {phase === "DELAYED_24H"
                  ? "24-hour retention check for reviewed words."
                  : "Immediate check after flashcard review."}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-secondary/15 px-3 py-1.5 text-xs font-body font-semibold text-[#9a5a08]">
            {phase === "DELAYED_24H" ? "Delayed" : "Immediate"}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-black/8 bg-white px-6 py-7 shadow-sm shadow-black/5 sm:px-7 sm:py-8">
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
