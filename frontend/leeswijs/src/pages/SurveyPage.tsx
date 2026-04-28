import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, CheckCircle2, ClipboardList } from "lucide-react";

import { submitSurvey } from "../services/api";
import LikertQuestion from "../components/survey/LikertQuestion";
import TLXQuestion from "../components/survey/TLXQuestion";
import type { LikertScale, TLXScale, SurveyResponse } from "../types";

  // Questions

const READING_EXPERIENCE_ITEMS = [
  {
    id: "easyToUnderstand",
    tag: "Reading Experience",
    question: "The text was easy to understand",
  },
  {
    id: "followIdeas",
    tag: "Reading Experience",
    question: "I could follow the main ideas of the text without difficulty",
  },
  {
    id: "appropriateChallenge",
    tag: "Reading Experience",
    question: "The text was appropriately challenging for my level",
  },
] as const;

const UES_ITEMS = [
  {
    id: "focusedAttention",
    tag: "UES-SF · Focused Attention",
    question: "I was so involved in this text that I lost track of time.",
  },
  {
    id: "reward",
    tag: "UES-SF · Reward",
    question: "I would want to read more texts similar to this one.",
  },
  {
    id: "perceivedRelevance",
    tag: "UES-SF · Perceived Relevance",
    question: "The content of this text felt personally meaningful to me.",
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

  // Reading Experience
  const [easyToUnderstand, setEasyToUnderstand] = useState<LikertScale | null>(null);
  const [followIdeas, setFollowIdeas] = useState<LikertScale | null>(null);
  const [appropriateChallenge, setAppropriateChallenge] = useState<LikertScale | null>(null);

  // UES
  const [focusedAttention, setFocusedAttention] = useState<LikertScale | null>(null);
  const [reward, setReward] = useState<LikertScale | null>(null);
  const [perceivedRelevance, setPerceivedRelevance] = useState<LikertScale | null>(null);

  // Cognitive load
  const [mentalEffort, setMentalEffort] = useState<TLXScale | null>(null);

  // Manipulation
  const [perceivedPersonalization, setPerceivedPersonalization] =
    useState<LikertScale | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Completion logic

  const answered = useMemo(() => {
    return (
      easyToUnderstand !== null &&
      followIdeas !== null &&
      appropriateChallenge !== null &&
      focusedAttention !== null &&
      reward !== null &&
      perceivedRelevance !== null &&
      mentalEffort !== null &&
      perceivedPersonalization !== null
    );
  }, [
    easyToUnderstand,
    followIdeas,
    appropriateChallenge,
    focusedAttention,
    reward,
    perceivedRelevance,
    mentalEffort,
    perceivedPersonalization,
  ]);

  const answeredCount = [
    easyToUnderstand,
    followIdeas,
    appropriateChallenge,
    focusedAttention,
    reward,
    perceivedRelevance,
    mentalEffort,
    perceivedPersonalization,
  ].filter(Boolean).length;

  // Submit

  async function handleSubmit() {
    if (!answered || !sessionId) return;

    setSubmitting(true);
    setError(null);

    const payload: SurveyResponse = {
      sessionId,

      easyToUnderstand: easyToUnderstand!,
      followIdeas: followIdeas!,
      appropriateChallenge: appropriateChallenge!,

      focusedAttention: focusedAttention!,
      reward: reward!,
      perceivedRelevance: perceivedRelevance!,

      mentalEffort: mentalEffort!,

      perceivedPersonalization: perceivedPersonalization!,
    };

    try {
      const res = await submitSurvey(payload);
      if (!res.success) throw new Error(res.error ?? "Submit failed");

      setDone(true);
      setTimeout(() => navigate("/home", { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
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
      <Header />

      <Progress value={answeredCount} total={8} />

      <ErrorBanner error={error} />

      <div className="bg-white rounded-2xl shadow-xl px-7 py-8 space-y-10">

        {/* Reading Experience */}
        <Section title="Reading Experience">
          {READING_EXPERIENCE_ITEMS.map((q) => {
            const map = {
              easyToUnderstand: [easyToUnderstand, setEasyToUnderstand],
              followIdeas: [followIdeas, setFollowIdeas],
              appropriateChallenge: [appropriateChallenge, setAppropriateChallenge],
            } as const;

            const [value, setter] = map[q.id];

            return (
              <LikertQuestion
                key={q.id}
                tag={q.tag}
                question={q.question}
                value={value}
                onChange={setter}
              />
            );
          })}
        </Section>

        <Divider />

        {/* UES */}
        <Section title="Engagement (UES-SF)">
          {UES_ITEMS.map((q) => {
            const map = {
              focusedAttention: [focusedAttention, setFocusedAttention],
              reward: [reward, setReward],
              perceivedRelevance: [perceivedRelevance, setPerceivedRelevance],
            } as const;

            const [value, setter] = map[q.id];

            return (
              <LikertQuestion
                key={q.id}
                tag={q.tag}
                question={q.question}
                value={value}
                onChange={setter}
              />
            );
          })}
        </Section>

        <Divider />

        <Section title="Cognitive Load">
          <TLXQuestion
            tag="NASA-TLX · Mental Effort"
            question={TLX_QUESTION}
            value={mentalEffort}
            onChange={setMentalEffort}
          />
        </Section>

        <Divider />

        <Section title="Manipulation Check">
          <LikertQuestion
            tag="Perceived Personalization"
            question={MANIPULATION_QUESTION}
            value={perceivedPersonalization}
            onChange={setPerceivedPersonalization}
          />
        </Section>
      </div>

      <SubmitButton disabled={!answered || submitting} loading={submitting} onClick={handleSubmit} />
    </motion.div>
  );
}

  // UI parts

function Section({ title, children }: any) {
  return (
    <div className="space-y-5">
      <h3 className="font-heading text-lg font-semibold">{title}</h3>
      <div className="space-y-6">{children}</div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3 mb-6">
      <ClipboardList className="text-primary" />
      <div>
        <h1 className="text-2xl font-bold">How was that reading?</h1>
        <p className="text-sm text-text/50">Please answer honestly</p>
      </div>
    </div>
  );
}

function Progress({ value, total }: any) {
  return (
    <div className="mb-6">
      <div className="text-xs mb-1">
        Progress {value}/{total}
      </div>
      <div className="h-1.5 bg-black/10 rounded-full">
        <motion.div className="h-full bg-primary" animate={{ width: `${(value / total) * 100}%` }} />
      </div>
    </div>
  );
}

function ErrorBanner({ error }: any) {
  if (!error) return null;
  return (
    <div className="bg-red-50 border border-red-200 p-3 rounded-xl mb-4 flex gap-2">
      <AlertCircle size={16} />
      {error}
    </div>
  );
}

function SubmitButton({ disabled, loading, onClick }: any) {
  return (
    <div className="mt-6 flex justify-end">
      <button
        disabled={disabled}
        onClick={onClick}
        className="px-6 py-3 rounded-xl bg-primary text-white disabled:bg-black/10"
      >
        {loading ? "Submitting..." : <>Submit <ArrowRight size={16} /></>}
      </button>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-black/5" />;
}

function ThankYouView() {
  return (
    <div className="text-center mt-20">
      <CheckCircle2 className="mx-auto text-green-500 mb-2" />
      <h2 className="text-xl font-bold">Thank you!</h2>
    </div>
  );
}