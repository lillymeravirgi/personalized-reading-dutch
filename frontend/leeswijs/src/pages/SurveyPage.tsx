import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, AlertCircle, CheckCircle2, ClipboardList, BookPlus,
} from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { submitSurvey } from "../services/api";
import LikertQuestion from "../components/survey/LikertQuestion";
import TLXQuestion    from "../components/survey/TLXQuestion";
import type { LikertScale, TLXScale, SurveyResponse } from "../types";

const Q_WORTH_MY_TIME       = "The reading felt worth my time and effort.";
const Q_FOCUSED_ATTENTION   = "I was so involved in this text that I lost track of time.";
const Q_REWARD              = "I would want to read more texts similar to this one.";
const Q_PERCEIVED_RELEVANCE = "The content of this text felt personally meaningful to me.";
const Q_MENTAL_EFFORT       = "How much mental effort did it take to read this text?";
const Q_MANIPULATION_CHECK  = "This text felt specifically tailored to my interests and Dutch level.";

const TOTAL_QUESTIONS = 6;

export default function SurveyPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { search } = useLocation();
  const durationSeconds = parseInt(new URLSearchParams(search).get("duration") || "0", 10);

  const [worthMyTime,           setWorthMyTime]           = useState<LikertScale | null>(null);
  const [focusedAttention,      setFocusedAttention]      = useState<LikertScale | null>(null);
  const [reward,                setReward]                = useState<LikertScale | null>(null);
  const [perceivedRelevance,    setPerceivedRelevance]    = useState<LikertScale | null>(null);
  const [mentalEffort,          setMentalEffort]          = useState<TLXScale    | null>(null);
  const [perceivedPersonalization, setPerceivedPersonalization] = useState<LikertScale | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [done,       setDone]       = useState(false);

  const answers = [worthMyTime, focusedAttention, reward, perceivedRelevance, mentalEffort, perceivedPersonalization];
  const answered      = answers.every((v) => v !== null);
  const answeredCount = answers.filter((v) => v !== null).length;

  async function handleSubmit() {
    if (!answered || !sessionId) return;
    setSubmitting(true);
    setError(null);

    const payload: SurveyResponse = {
      sessionId,
      worthMyTime:              worthMyTime!,
      appropriateChallenge:     3,
      comprehension:            3,
      focusedAttention:         focusedAttention!,
      reward:                   reward!,
      perceivedRelevance:       perceivedRelevance!,
      mentalEffort:             mentalEffort!,
      perceivedPersonalization: perceivedPersonalization!,
      duration_seconds:         durationSeconds,
    };

    try {
      const res = await submitSurvey(payload);
      if (!res.success) throw new Error(res.error ?? "Could not submit survey.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit survey.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <ThankYouView
        onReadNext={() => navigate("/reading", { replace: true })}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-2xl mx-auto"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">A few questions about the reading</h1>
          <p className="text-sm font-body text-text/50">Please answer carefully from your own experience. There are {TOTAL_QUESTIONS} short questions.</p>
        </div>
      </div>

      <div className="mt-6 mb-8">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-body font-semibold text-text/60 uppercase tracking-wide">Progress</span>
          <span className="text-xs font-body text-text/50">{answeredCount} / {TOTAL_QUESTIONS}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/8">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${(answeredCount / TOTAL_QUESTIONS) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
            <p className="text-sm text-red-700 font-body">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-7 rounded-2xl bg-white px-7 py-8 shadow-xl shadow-black/8">
        <LikertQuestion question={Q_WORTH_MY_TIME} value={worthMyTime} onChange={setWorthMyTime} />

        <Divider />

        <LikertQuestion question={Q_FOCUSED_ATTENTION} value={focusedAttention} onChange={setFocusedAttention} />
        <Divider />
        <LikertQuestion question={Q_REWARD} value={reward} onChange={setReward} />
        <Divider />
        <LikertQuestion question={Q_PERCEIVED_RELEVANCE} value={perceivedRelevance} onChange={setPerceivedRelevance} />

        <Divider />

        <TLXQuestion question={Q_MENTAL_EFFORT} value={mentalEffort} onChange={setMentalEffort} />

        <Divider />

        <LikertQuestion question={Q_MANIPULATION_CHECK} value={perceivedPersonalization} onChange={setPerceivedPersonalization} />
      </div>

      <div className="mt-7 flex justify-end">
        <motion.button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!answered || submitting}
          whileTap={answered && !submitting ? { scale: 0.97 } : {}}
          className={[
            "inline-flex items-center gap-2 rounded-xl px-6 py-3",
            "text-sm font-heading font-semibold transition-opacity",
            answered && !submitting
              ? "bg-primary text-white hover:opacity-90"
              : "bg-black/8 text-text/40 cursor-not-allowed",
          ].join(" ")}
        >
          {submitting ? <Spinner /> : <><ArrowRight size={16} strokeWidth={2.5} />Submit</>}
        </motion.button>
      </div>

      {!answered && (
        <p className="mt-3 text-right text-xs text-text/40 font-body">
          Please answer all {TOTAL_QUESTIONS} questions to continue.
        </p>
      )}
    </motion.div>
  );
}

function ThankYouView({ onReadNext }: { onReadNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10 flex flex-col items-center text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50"
      >
        <CheckCircle2 size={28} className="text-emerald-600" strokeWidth={1.8} />
      </motion.div>
      <h2 className="font-heading text-xl font-bold text-text mb-1">Reading task complete</h2>
      <p className="text-sm font-body text-text/50 max-w-sm">
        Your response has been recorded. Return to the reading page to continue.
      </p>
      <div className="mt-7 w-full">
        <motion.button type="button" onClick={onReadNext} whileTap={{ scale: 0.97 }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-heading font-semibold text-white hover:opacity-90">
          <BookPlus size={15} /> Back to Reading
        </motion.button>
      </div>
    </motion.div>
  );
}

function Divider() { return <div className="h-px bg-black/6" />; }

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
