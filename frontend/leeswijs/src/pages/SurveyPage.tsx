import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, AlertCircle, CheckCircle2, ClipboardList } from "lucide-react";

import { submitSurvey } from "../services/api";
import LikertQuestion from "../components/survey/LikertQuestion";
import TLXQuestion from "../components/survey/TLXQuestion";
import type { LikertScale, TLXScale, SurveyResponse } from "../types";

// Question definitions.
// Instruments used:
//   UES-SF      — O'Brien, Cairns & Hall (2018)
//   NASA-TLX    — Hart & Staveland (1988)
//   Man. check  — perceived personalization

const UES_ITEMS = [
  {
    id: "focusedAttention",
    tag: "UES-SF · Focused Attention",
    question:
      "I was so involved in this text that I lost track of time.",
  },
  {
    id: "reward",
    tag: "UES-SF · Reward",
    question:
      "I would want to read more texts similar to this one.",
  },
  {
    id: "perceivedRelevance",
    tag: "UES-SF · Perceived Relevance",
    question:
      "The content of this text felt personally meaningful to me.",
  },
] as const;

const MANIPULATION_QUESTION =
  "This text felt specifically tailored to my interests and level.";

const TLX_QUESTION =
  "How much mental effort did it take to read this text?";

// Component
export default function SurveyPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [focusedAttention,         setFocusedAttention]         = useState<LikertScale | null>(null);
  const [reward,                   setReward]                   = useState<LikertScale | null>(null);
  const [perceivedRelevance,       setPerceivedRelevance]       = useState<LikertScale | null>(null);
  const [mentalEffort,             setMentalEffort]             = useState<TLXScale | null>(null);
  const [perceivedPersonalization, setPerceivedPersonalization] = useState<LikertScale | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [done,       setDone]       = useState(false);

  const UES_SETTERS: Record<string, (v: LikertScale) => void> = {
    focusedAttention:   setFocusedAttention,
    reward:             setReward,
    perceivedRelevance: setPerceivedRelevance,
  };
  const UES_VALUES: Record<string, LikertScale | null> = {
    focusedAttention,
    reward,
    perceivedRelevance,
  };

  const answered =
    focusedAttention !== null &&
    reward !== null &&
    perceivedRelevance !== null &&
    mentalEffort !== null &&
    perceivedPersonalization !== null;

  const answeredCount = [
    focusedAttention,
    reward,
    perceivedRelevance,
    mentalEffort,
    perceivedPersonalization,
  ].filter((v) => v !== null).length;

  async function handleSubmit() {
    if (!answered || !sessionId) return;
    setSubmitting(true);
    setError(null);
    const payload: SurveyResponse = {
      sessionId,
      focusedAttention:         focusedAttention!,
      reward:                   reward!,
      perceivedRelevance:       perceivedRelevance!,
      mentalEffort:             mentalEffort!,
      perceivedPersonalization: perceivedPersonalization!,
    };
    try {
      const res = await submitSurvey(payload);
      if (!res.success) throw new Error(res.error ?? "Could not submit survey.");
      setDone(true);
      // Brief pause on success screen then hand back to /home.
      setTimeout(() => navigate("/home", { replace: true }), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit survey.");
    } finally {
      setSubmitting(false);
    }
  }

  // Thank-you screen after submit
  if (done) {
    return <ThankYouView />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-2xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
          <ClipboardList size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">
            How was that reading?
          </h1>
          <p className="text-sm font-body text-text/50">
            Five short questions. This helps the research — please be honest.
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-6 mb-8">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-body font-semibold text-text/60 uppercase tracking-wide">
            Progress
          </span>
          <span className="text-xs font-body text-text/50">
            {answeredCount} / 5
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-black/8 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${(answeredCount / 5) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3"
          >
            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 font-body">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Questions */}
      <div className="bg-white rounded-2xl shadow-xl shadow-black/8 px-7 py-8 space-y-8">
        {/* UES-SF block */}
        {UES_ITEMS.map((item) => (
          <LikertQuestion
            key={item.id}
            tag={item.tag}
            question={item.question}
            value={UES_VALUES[item.id]}
            onChange={UES_SETTERS[item.id]}
          />
        ))}

        <Divider />

        {/* NASA-TLX */}
        <TLXQuestion
          tag="NASA-TLX · Mental Effort"
          question={TLX_QUESTION}
          value={mentalEffort}
          onChange={setMentalEffort}
        />

        <Divider />

        {/* Manipulation check */}
        <LikertQuestion
          tag="Manipulation check · Perceived Personalization"
          question={MANIPULATION_QUESTION}
          value={perceivedPersonalization}
          onChange={setPerceivedPersonalization}
        />
      </div>

      {/* Submit */}
      <div className="mt-7 flex justify-end">
        <motion.button
          type="button"
          onClick={handleSubmit}
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
          {submitting ? (
            <Spinner />
          ) : (
            <>
              Submit
              <ArrowRight size={16} strokeWidth={2.5} />
            </>
          )}
        </motion.button>
      </div>

      {!answered && (
        <p className="mt-3 text-right text-xs text-text/40 font-body">
          Please answer all five questions to continue.
        </p>
      )}
    </motion.div>
  );
}

// Sub-views
function ThankYouView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-md mx-auto bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10 flex flex-col items-center text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50"
      >
        <CheckCircle2 size={28} className="text-emerald-600" strokeWidth={1.8} />
      </motion.div>
      <h2 className="font-heading text-xl font-bold text-text mb-1">
        Thank you!
      </h2>
      <p className="text-sm font-body text-text/50 max-w-xs">
        Your response has been recorded. Taking you back to Home…
      </p>
    </motion.div>
  );
}

function Divider() {
  return <div className="h-px bg-black/6" />;
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
