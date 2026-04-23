import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, BookOpen, Sparkles, SkipForward } from "lucide-react";
import { getAssessmentBatch, submitAssessment, saveProfile } from "../services/api";
import { useStore } from "../store";
import type { AssessmentBatch, AssessmentResult } from "../types";

// Constants
const TOTAL_BATCHES = 3;

const LEVEL_META: Record<
  string,
  { label: string; description: string; color: string; fill: number }
> = {
  A1: { label: "A1 — Beginner",       description: "You're just starting out. Great time to build a foundation!",      color: "#94a3b8", fill: 8  },
  A2: { label: "A2 — Elementary",     description: "You know the basics. Reading simple texts will feel rewarding.",    color: "#60a5fa", fill: 24 },
  B1: { label: "B1 — Intermediate",   description: "You can handle everyday topics. Your vocabulary is growing well.", color: "#0D7377", fill: 48 },
  B2: { label: "B2 — Upper-Intermediate", description: "You read complex texts with ease. Impressive range!",          color: "#7c3aed", fill: 68 },
  C1: { label: "C1 — Advanced",       description: "Near-native reading ability. Very few words will trip you up.",    color: "#F2A541", fill: 84 },
  C2: { label: "C2 — Mastery",        description: "You read Dutch like a native. The full range is open to you.",     color: "#ef4444", fill: 100 },
};

// Component
type Phase = "assessment" | "analyzing" | "results";

export default function AssessmentPage() {
  const navigate   = useNavigate();
  const setUser    = useStore((s) => s.setUser);
  const user       = useStore((s) => s.user);

  const [phase,        setPhase]        = useState<Phase>("assessment");
  const [batchNum,     setBatchNum]     = useState(1);
  const [batch,        setBatch]        = useState<AssessmentBatch | null>(null);
  const [knownIds,     setKnownIds]     = useState<Set<string>>(new Set());
  const [allKnown,     setAllKnown]     = useState<string[]>([]);
  const [allUnknown,   setAllUnknown]   = useState<string[]>([]);
  const [result,       setResult]       = useState<AssessmentResult | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(true);

  // Fetch batch on mount and whenever batchNum changes
  useEffect(() => {
    let cancelled = false;
    setLoadingBatch(true);
    setKnownIds(new Set());
    getAssessmentBatch(batchNum).then((res) => {
      if (!cancelled && res.success) setBatch(res.data);
      setLoadingBatch(false);
    });
    return () => { cancelled = true; };
  }, [batchNum]);

  function toggleWord(wordId: string) {
    setKnownIds((prev) => {
      const next = new Set(prev);
      next.has(wordId) ? next.delete(wordId) : next.add(wordId);
      return next;
    });
  }

  async function handleNextBatch() {
    if (!batch) return;

    const batchKnown   = batch.words.filter((w) =>  knownIds.has(w.wordId)).map((w) => w.wordId);
    const batchUnknown = batch.words.filter((w) => !knownIds.has(w.wordId)).map((w) => w.wordId);
    const cumulativeKnown   = [...allKnown,   ...batchKnown];
    const cumulativeUnknown = [...allUnknown, ...batchUnknown];

    if (batchNum < TOTAL_BATCHES) {
      setAllKnown(cumulativeKnown);
      setAllUnknown(cumulativeUnknown);
      setBatchNum((n) => n + 1);
      return;
    }

    // Final batch — submit and analyze
    setPhase("analyzing");

    const assessmentResult: AssessmentResult = {
      knownWordIds:   cumulativeKnown,
      unknownWordIds: cumulativeUnknown,
      estimatedLevel: inferLevel(cumulativeKnown.length),
      confidenceScore: Math.min(0.95, 0.5 + cumulativeKnown.length * 0.007),
    };

    await submitAssessment(assessmentResult);

    // Update user's CEFR level + record the timestamp so Settings can show
    // "Last assessed N days ago" and gate the retake flow. Persist so the
    // MainLayout guard lets them through on the next login.
    if (user) {
      const updated = {
        ...user,
        cefrLevel: assessmentResult.estimatedLevel as ReturnType<typeof inferLevel>,
        assessedAt: new Date().toISOString(),
      };
      setUser(updated);
      void saveProfile(updated);
    }

    // Hold analyzing screen for 2 s for effect
    setTimeout(() => {
      setResult(assessmentResult);
      setPhase("results");
    }, 2000);
  }

  function handleSkipBatch() {
    setKnownIds(new Set());
    handleNextBatch();
  }

  // Render
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-9"
    >
      <AnimatePresence mode="wait">
        {phase === "assessment" && (
          <AssessmentView
            key="assessment"
            batch={batch}
            batchNum={batchNum}
            totalBatches={TOTAL_BATCHES}
            knownIds={knownIds}
            loading={loadingBatch}
            onToggle={toggleWord}
            onNext={handleNextBatch}
            onSkip={handleSkipBatch}
          />
        )}
        {phase === "analyzing" && <AnalyzingView key="analyzing" />}
        {phase === "results" && result && (
          <ResultsView key="results" result={result} onStart={() => navigate("/home")} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// AssessmentView
function AssessmentView({
  batch, batchNum, totalBatches, knownIds, loading, onToggle, onNext, onSkip,
}: {
  batch: AssessmentBatch | null;
  batchNum: number;
  totalBatches: number;
  knownIds: Set<string>;
  loading: boolean;
  onToggle: (id: string) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const knownCount = knownIds.size;
  const isLast     = batchNum === totalBatches;

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Step + batch progress */}
      <div className="flex items-center justify-between mb-6">
        <StepIndicator current={2} total={2} />
        <span className="text-xs font-body text-text/40">
          Batch {batchNum} of {totalBatches}
        </span>
      </div>

      {/* Batch progress bar */}
      <div className="mb-6 h-1.5 rounded-full bg-black/8 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: `${((batchNum - 1) / totalBatches) * 100}%` }}
          animate={{ width: `${(batchNum / totalBatches) * 100}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Heading */}
      <div className="mb-5">
        <h1 className="font-heading text-2xl font-bold text-text">
          Let's find your level
        </h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Tap the words you already know — no pressure, just be honest!
        </p>
      </div>

      {/* Word count badge */}
      <div className="mb-4 flex items-center gap-2">
        <motion.div
          key={knownCount}
          initial={{ scale: 1.25 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200"
        >
          <Check size={12} strokeWidth={3} className="text-emerald-600" />
          <span className="text-xs font-heading font-bold text-emerald-700">
            {knownCount} known
          </span>
        </motion.div>
        <span className="text-xs text-text/35 font-body">
          out of {batch?.words.length ?? "—"} words
        </span>
      </div>

      {/* Word chips */}
      {loading ? (
        <ChipSkeleton />
      ) : (
        <motion.div
          key={`batch-${batchNum}`}
          className="flex flex-wrap gap-2.5 max-h-64 overflow-y-auto pr-1"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
        >
          {batch?.words.map((word) => (
            <WordChip
              key={word.wordId}
              dutch={word.dutch}
              isKnown={knownIds.has(word.wordId)}
              onToggle={() => onToggle(word.wordId)}
            />
          ))}
        </motion.div>
      )}

      {/* Actions */}
      <div className="mt-7 flex flex-col gap-2.5">
        <motion.button
          type="button"
          onClick={onNext}
          whileTap={{ scale: 0.97 }}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-heading font-semibold text-white hover:opacity-90 transition-opacity"
        >
          {isLast ? "See My Results" : "Next Batch"}
          <ArrowRight size={16} strokeWidth={2.5} />
        </motion.button>

        <button
          type="button"
          onClick={onSkip}
          className="w-full flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-body text-text/40 hover:text-text/60 hover:bg-black/[0.03] transition-colors"
        >
          <SkipForward size={14} />
          I know none of these
        </button>
      </div>
    </motion.div>
  );
}

// WordChip
function WordChip({
  dutch, isKnown, onToggle,
}: {
  dutch: string;
  isKnown: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      variants={{
        hidden:  { opacity: 0, scale: 0.85, y: 8 },
        visible: { opacity: 1, scale: 1,    y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      <motion.button
        type="button"
        onClick={onToggle}
        whileTap={{ scale: 0.88 }}
        animate={isKnown ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={{ duration: 0.2 }}
        className={[
          "relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5",
          "text-sm font-body font-medium border transition-all duration-150 select-none",
          isKnown
            ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm shadow-emerald-100"
            : "bg-black/[0.025] border-black/10 text-text/60 hover:border-black/20 hover:bg-black/[0.04]",
        ].join(" ")}
      >
        <AnimatePresence>
          {isKnown && (
            <motion.span
              key="check"
              initial={{ scale: 0, opacity: 0, width: 0 }}
              animate={{ scale: 1, opacity: 1, width: "auto" }}
              exit={{   scale: 0, opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="overflow-hidden"
            >
              <Check size={12} strokeWidth={3} className="text-emerald-600" />
            </motion.span>
          )}
        </AnimatePresence>
        {dutch}
      </motion.button>
    </motion.div>
  );
}

// Skeleton while batch loads
function ChipSkeleton() {
  return (
    <div className="flex flex-wrap gap-2.5">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="h-8 rounded-full bg-black/6 animate-pulse"
          style={{ width: `${60 + (i % 5) * 18}px` }}
        />
      ))}
    </div>
  );
}

// AnalyzingView
function AnalyzingView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center justify-center py-12 gap-6"
    >
      {/* Spinning ring */}
      <div className="relative w-20 h-20">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <BookOpen size={28} className="text-primary/60" strokeWidth={1.5} />
        </div>
      </div>

      <div className="text-center space-y-1.5">
        <p className="font-heading text-lg font-bold text-text">
          Analyzing your vocabulary…
        </p>
        <motion.p
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="text-sm text-text/45 font-body"
        >
          Mapping your knowledge across CEFR levels
        </motion.p>
      </div>

      {/* Animated dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary"
            animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ResultsView
function ResultsView({
  result,
  onStart,
}: {
  result: AssessmentResult;
  onStart: () => void;
}) {
  const meta      = LEVEL_META[result.estimatedLevel] ?? LEVEL_META["B1"];
  const totalWords = result.knownWordIds.length + result.unknownWordIds.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center"
    >
      {/* Sparkle icon */}
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: `${meta.color}18` }}
      >
        <Sparkles size={30} style={{ color: meta.color }} strokeWidth={1.6} />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="font-heading text-2xl font-bold text-text"
      >
        Your level is
      </motion.h2>

      {/* CEFR badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 16 }}
        className="mt-3 mb-5 px-6 py-2 rounded-2xl font-heading text-3xl font-bold text-white"
        style={{ backgroundColor: meta.color }}
      >
        {result.estimatedLevel}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-base font-heading font-semibold text-text mb-1"
      >
        {meta.label.split("—")[1]?.trim()}
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-sm text-text/50 font-body mb-7 max-w-xs"
      >
        {meta.description}
      </motion.p>

      {/* Level gauge */}
      <LevelGauge fill={meta.fill} color={meta.color} />

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-6 mb-8 flex gap-6 text-center"
      >
        <Stat value={result.knownWordIds.length} label="words known" color={meta.color} />
        <div className="w-px bg-black/8" />
        <Stat value={totalWords}                  label="words tested" color="#a8a29e" />
        <div className="w-px bg-black/8" />
        <Stat
          value={`${Math.round((result.knownWordIds.length / totalWords) * 100)}%`}
          label="recognition rate"
          color={meta.color}
        />
      </motion.div>

      {/* CTA */}
      <motion.button
        type="button"
        onClick={onStart}
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-heading font-semibold text-white hover:opacity-90 transition-opacity"
      >
        Start Reading
        <ArrowRight size={16} strokeWidth={2.5} />
      </motion.button>
    </motion.div>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-heading text-xl font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-xs text-text/40 font-body">{label}</span>
    </div>
  );
}

// LevelGauge
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

function LevelGauge({ fill, color }: { fill: number; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="w-full"
    >
      {/* Bar */}
      <div className="h-3 rounded-full bg-black/8 overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: "0%" }}
          animate={{ width: `${fill}%` }}
          transition={{ delay: 0.65, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {/* Level labels */}
      <div className="flex justify-between">
        {LEVELS.map((lvl) => (
          <span
            key={lvl}
            className="text-[10px] font-heading font-semibold"
            style={{ color: lvl === LEVELS[Math.round((fill / 100) * 5)] ? color : "#d4d4d0" }}
          >
            {lvl}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// StepIndicator
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }, (_, i) => {
        const step   = i + 1;
        const done   = step < current;
        const active = step === current;
        return (
          <div key={step} className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <motion.div
                animate={{
                  backgroundColor: active ? "#0D7377" : done ? "#0D737740" : "#e7e5e4",
                  scale: active ? 1.1 : 1,
                }}
                transition={{ duration: 0.3 }}
                className="w-6 h-6 rounded-full flex items-center justify-center"
              >
                {done ? (
                  <Check size={11} strokeWidth={3} className="text-primary" />
                ) : (
                  <span
                    className="text-xs font-heading font-bold"
                    style={{ color: active ? "#fff" : "#a8a29e" }}
                  >
                    {step}
                  </span>
                )}
              </motion.div>
              <span
                className="text-xs font-body font-semibold"
                style={{ color: active ? "#0D7377" : "#a8a29e" }}
              >
                {step === 1 ? "Interests" : "Assessment"}
              </span>
            </div>
            {i < total - 1 && <div className="h-px w-6 bg-black/10" />}
          </div>
        );
      })}
    </div>
  );
}

// Helpers
type CefrLevelKey = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

function inferLevel(knownCount: number): CefrLevelKey {
  // 3 batches × 20 words = 60 words total
  if (knownCount <= 6)  return "A1";
  if (knownCount <= 15) return "A2";
  if (knownCount <= 28) return "B1";
  if (knownCount <= 40) return "B2";
  if (knownCount <= 52) return "C1";
  return "C2";
}
