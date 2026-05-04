import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Home,
  Layers,
} from "lucide-react";

import { submitSurvey } from "../services/api";
import LikertQuestion from "../components/survey/LikertQuestion";
import TLXQuestion from "../components/survey/TLXQuestion";
import type { LikertScale, TLXScale, SurveyResponse } from "../types";

const Q_WORTH_MY_TIME =
  "The reading felt worth my time and effort.";                             // RQ1-W3
const Q_APPROPRIATE_CHALLENGE =
  "The text was appropriately challenging for my level.";                   // ZPD-1
const Q_COMPREHENSION =
  "I could follow the main ideas of the text without difficulty.";          // COMP-1
const Q_FOCUSED_ATTENTION =
  "I was so involved in this text that I lost track of time.";              // UES-FA
const Q_REWARD =
  "I would want to read more texts similar to this one.";                   // UES-RW
const Q_PERCEIVED_RELEVANCE =
  "The content of this text felt personally meaningful to me.";             // UES-PR
const Q_MENTAL_EFFORT =
  "How much mental effort did it take to read this text?";                  // TLX-MD
const Q_MANIPULATION_CHECK =
  "This text felt specifically tailored to my interests and Dutch level.";  // MC-1

const TOTAL_QUESTIONS = 8;

export default function SurveyPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  //const sessionId = "1";
  const navigate = useNavigate();

  // Section 1 — RQ1
  const [worthMyTime, setWorthMyTime] = useState<LikertScale | null>(null);
  // Section 2 — Flow/ZPD + RQ3 context
  const [appropriateChallenge, setAppropriateChallenge] = useState<LikertScale | null>(null);
  const [comprehension, setComprehension] = useState<LikertScale | null>(null);
  // Section 3 — UES-SF / RQ2
  const [focusedAttention, setFocusedAttention] = useState<LikertScale | null>(null);
  const [reward, setReward] = useState<LikertScale | null>(null);
  const [perceivedRelevance, setPerceivedRelevance] = useState<LikertScale | null>(null);
  // Section 4 — NASA-TLX / RQ2
  const [mentalEffort, setMentalEffort] = useState<TLXScale | null>(null);
  // Section 5 — Manipulation check
  const [perceivedPersonalization, setPerceivedPersonalization] = useState<LikertScale | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const answers: Array<LikertScale | TLXScale | null> = [
    worthMyTime,
    appropriateChallenge,
    comprehension,
    focusedAttention,
    reward,
    perceivedRelevance,
    mentalEffort,
    perceivedPersonalization,
  ];

  const answered = answers.every((v) => v !== null);
  const answeredCount = answers.filter((v) => v !== null).length;

  async function handleSubmit() {
    if (!answered || !sessionId) return;
    setSubmitting(true);
    setError(null);

    // All fields match SurveyResponse exactly — no TS(2353) errors
    const payload: SurveyResponse = {
      sessionId,
      worthMyTime:              worthMyTime!,
      appropriateChallenge:     appropriateChallenge!,
      comprehension:            comprehension!,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit survey.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <ThankYouView
        onHome={() => navigate("/home", { replace: true })}
        onReviewWords={() =>
          navigate(`/flashcards?sessionId=${encodeURIComponent(sessionId)}`, { replace: true })
        }
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">
            A few questions about the reading
          </h1>
          <p className="text-sm font-body text-text/50">
            Please take a moment to answer carefully from your own experience. There are eight short questions.
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-6 mb-8">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-body font-semibold text-text/60 uppercase tracking-wide">
            Progress
          </span>
          <span className="text-xs font-body text-text/50">
            {answeredCount} / {TOTAL_QUESTIONS}
          </span>
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

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />
            <p className="text-sm text-red-700 font-body">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Questions */}
      <div className="space-y-8 rounded-2xl bg-white px-7 py-8 shadow-xl shadow-black/8">

        <SectionLabel label="Reading value" />
        <LikertQuestion tag="RQ1" question={Q_WORTH_MY_TIME} value={worthMyTime} onChange={setWorthMyTime} />

        <Divider />

        <SectionLabel label="Challenge & comprehension" />
        <LikertQuestion tag="Appropriate challenge" question={Q_APPROPRIATE_CHALLENGE} value={appropriateChallenge} onChange={setAppropriateChallenge} />
        <Divider />
        <LikertQuestion tag="Comprehension" question={Q_COMPREHENSION} value={comprehension} onChange={setComprehension} />

        <Divider />

        <SectionLabel label="Engagement" />
        <LikertQuestion tag="Focused attention" question={Q_FOCUSED_ATTENTION} value={focusedAttention} onChange={setFocusedAttention} />
        <Divider />
        <LikertQuestion tag="Reward" question={Q_REWARD} value={reward} onChange={setReward} />
        <Divider />
        <LikertQuestion tag="Perceived relevance" question={Q_PERCEIVED_RELEVANCE} value={perceivedRelevance} onChange={setPerceivedRelevance} />

        <Divider />

        <SectionLabel label="Mental effort" />
        <TLXQuestion tag="Cognitive load" question={Q_MENTAL_EFFORT} value={mentalEffort} onChange={setMentalEffort} />

        <Divider />

        <SectionLabel label="Text fit" />
        <LikertQuestion tag="Manipulation check" question={Q_MANIPULATION_CHECK} value={perceivedPersonalization} onChange={setPerceivedPersonalization} />

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

// ── Thank-you screen ──────────────────────────────────────────────────────────
function ThankYouView({
  onHome,
  onReviewWords,
}: {
  onHome: () => void;
  onReviewWords: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-lg mx-auto bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10 flex flex-col items-center text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50"
      >
        <CheckCircle2 size={28} className="text-emerald-600" strokeWidth={1.8} />
      </motion.div>
      <h2 className="font-heading text-xl font-bold text-text mb-1">Reading task complete</h2>
      <p className="text-sm font-body text-text/50 max-w-sm">
        Your response has been recorded. Next, review the words you selected while reading.
      </p>
      <div className="mt-7 grid w-full gap-3">
        <motion.button type="button" onClick={onReviewWords} whileTap={{ scale: 0.97 }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-heading font-semibold text-white hover:opacity-90">
          <Layers size={15} /> Review words
        </motion.button>
        <motion.button type="button" onClick={onHome} whileTap={{ scale: 0.97 }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/12 bg-white px-4 py-3 text-sm font-heading font-semibold text-text hover:bg-black/[0.03]">
          <Home size={15} /> Back home
        </motion.button>
      </div>
    </motion.div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-body font-semibold uppercase tracking-widest text-text/35">
      {label}
    </p>
  );
}

function Divider() {
  return <div className="h-px bg-black/6" />;
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
