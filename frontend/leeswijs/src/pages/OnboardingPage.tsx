import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, Hourglass } from "lucide-react";
import { useStore } from "../store";
import {
  savePersonalInfo,
  saveProfile,
  selectOnboardingWords,
  getAssessmentBatch,
  submitAssessment,
} from "../services/api";
import { INTERESTS, type InterestId } from "../constants/interests";
import { READING_STYLES, PURPOSES, type ReadingStyle, type Purpose } from "../types";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const TOTAL_BATCHES = 2;

type Step = "personal" | "interests" | "assessment";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const user   = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);

  const [step, setStep] = useState<Step>("personal");

  // ── Step 1 state ───────────────────────────
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [age,         setAge]         = useState<number | "">(user?.age ?? "");
  const [city,        setCity]        = useState(user?.city ?? "");
  const [gender,      setGender]      = useState(user?.gender ?? "");
  const [job,         setJob]         = useState(user?.job ?? "");
  const [academic,    setAcademic]    = useState(user?.academic_background ?? "");
  const [motherLang,  setMotherLang]  = useState(user?.mother_language ?? "");
  const [otherLangs,  setOtherLangs]  = useState(user?.other_languages ?? "");
  const [purpose,     setPurpose]     = useState<Purpose | "">(user?.purpose ?? "");
  const [selfCefr,    setSelfCefr]    = useState<string>(user?.cefrLevel ?? "B1");
  const [readingStyles, setReadingStyles] = useState<ReadingStyle[]>(user?.preferred_styles ?? []);

  // ── Step 2 state ───────────────────────────
  const [selectedInterests, setSelectedInterests] = useState<Set<InterestId>>(
    new Set((user?.interests ?? []) as InterestId[]),
  );

  // ── Step 3 state ───────────────────────────
  const [batchNum,     setBatchNum]     = useState(1);
  const [batch,        setBatch]        = useState<null | Awaited<ReturnType<typeof getAssessmentBatch>>>(null);
  const [knownIds,     setKnownIds]     = useState<Set<string>>(new Set());
  const [allKnownIds,  setAllKnownIds]  = useState<Set<string>>(new Set());
  const [allWordsSeen, setAllWordsSeen] = useState<Array<{ wordId: string; dutch: string }>>([]);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [calculatingResults, setCalculatingResults] = useState(false);
  const [assessDone,   setAssessDone]   = useState(false);
  const [finalResult,  setFinalResult]  = useState<{ level: string; acquisition: number } | null>(null);

  // ── Step 1 handlers ────────────────────────
  const toggleStyle = (s: ReadingStyle) =>
    setReadingStyles((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  async function handlePersonalNext() {
    if (!user) return;
    await savePersonalInfo(user.id, {
      display_name:        displayName,
      age:                 age !== "" ? Number(age) : undefined,
      city,
      gender,
      job,
      academic_background: academic,
      mother_language:     motherLang,
      other_languages:     otherLangs,
      purpose:             purpose || undefined,
      preferred_styles:    readingStyles,
      self_reported_cefr:  selfCefr,
    });
    setUser({
      ...user,
      display_name: displayName,
      name: displayName || user.email,
      age: age !== "" ? Number(age) : null,
      city, gender, job,
      academic_background: academic,
      mother_language: motherLang,
      other_languages: otherLangs,
      purpose: (purpose as Purpose) || null,
      preferred_styles: readingStyles,
      cefrLevel: selfCefr as typeof user.cefrLevel,
    });
    setStep("interests");
  }

  // ── Step 2 handlers ────────────────────────
  function toggleInterest(id: InterestId) {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 6) next.add(id);
      return next;
    });
  }

  async function handleInterestsNext() {
    if (!user || selectedInterests.size < 1) return;
    await saveProfile({ ...user, interests: [...selectedInterests] });
    setUser({ ...user, interests: [...selectedInterests] });
    // Kick off batch 1 generation
    setStep("assessment");
    setLoadingBatch(true);
    const res = await getAssessmentBatch(1, user.id, selfCefr);
    setBatch(res);
    setLoadingBatch(false);
  }

  // ── Step 3 handlers ────────────────────────
  function toggleWord(wordId: string) {
    setKnownIds((prev) => {
      const next = new Set(prev);
      next.has(wordId) ? next.delete(wordId) : next.add(wordId);
      return next;
    });
  }

  async function handleNextBatch() {
    if (!user || !batch || !batch.success) return;

    const words = batch.data.words;
    const cumKnown = new Set([...allKnownIds, ...knownIds]);
    const cumSeen  = [...allWordsSeen, ...words.map((w) => ({ wordId: w.wordId, dutch: w.dutch }))];

    if (batchNum < TOTAL_BATCHES) {
      setAllKnownIds(cumKnown);
      setAllWordsSeen(cumSeen);
      setKnownIds(new Set());
      setBatchNum((n) => n + 1);
      setLoadingBatch(true);
      const res = await getAssessmentBatch(
        batchNum + 1, user.id, selfCefr,
        [...cumKnown].map((id) => cumSeen.find((w) => w.wordId === id)?.dutch ?? "").filter(Boolean),
        cumSeen.map((w) => w.dutch),
      );
      setBatch(res);
      setLoadingBatch(false);
      return;
    }

    // Final batch — compute CEFR and Acquisition
    setCalculatingResults(true);
    const secondPitchWords = words.filter((w) => !w.isPseudo);
    const secondPitchKnown = secondPitchWords.filter((w) => knownIds.has(w.wordId));
    const acquisitionScore = secondPitchWords.length > 0 ? secondPitchKnown.length / secondPitchWords.length : 0;
    
    const cefrIndex = CEFR_LEVELS.indexOf(selfCefr as any) !== -1 ? CEFR_LEVELS.indexOf(selfCefr as any) : 2;
    let finalLevel = selfCefr;
    if (acquisitionScore > 0.8) {
      finalLevel = CEFR_LEVELS[Math.min(CEFR_LEVELS.length - 1, cefrIndex + 1)];
    } else if (acquisitionScore < 0.5) {
      finalLevel = CEFR_LEVELS[Math.max(0, cefrIndex - 1)];
    }

    await submitAssessment(
      user.id, batchNum,
      [...cumKnown].filter((id) => !id.startsWith("pseudo")),
      cumSeen.filter((w) => !w.wordId.startsWith("pseudo")).map((w) => w.wordId),
      finalLevel, Math.min(0.95, 0.5 + Math.max(0, acquisitionScore) * 0.45),
      true,
    );

    // Trigger KRS to select 7 onboarding words
    await selectOnboardingWords(user.id).catch(() => {});

    setUser({ ...user, cefrLevel: finalLevel as typeof user.cefrLevel });
    setFinalResult({ level: finalLevel, acquisition: Math.round(acquisitionScore * 100) });
    setCalculatingResults(false);
    setAssessDone(true);
  }

  if (calculatingResults) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-20 text-center flex flex-col items-center justify-center"
      >
        <Hourglass size={36} className="text-primary animate-pulse mb-5" />
        <h2 className="font-heading text-xl font-bold text-text mb-2">
          Calculating Results
        </h2>
        <p className="text-sm font-body text-text/60 animate-pulse">
          Finalizing your profile and estimating your vocabulary depth...
        </p>
      </motion.div>
    );
  }

  if (assessDone && finalResult) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-10 text-center"
      >
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="font-heading text-2xl font-bold text-text mb-2">
          Results Summary
        </h2>
        <div className="bg-black/[0.02] border border-black/10 rounded-xl p-6 mb-8 inline-block text-left w-full max-w-sm">
          <p className="text-sm font-body text-text/60 mb-1">Your Estimated Dutch Level:</p>
          <p className="font-heading text-xl font-bold text-primary mb-4">{finalResult.level}</p>
          
          <p className="text-sm font-body text-text/60 mb-1">Vocabulary Acquisition:</p>
          <p className="font-heading text-xl font-bold text-secondary">{finalResult.acquisition}%</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/onboarding/flashcards", { replace: true })}
          className="inline-flex items-center justify-center w-full max-w-sm gap-2 bg-primary text-white rounded-xl px-6 py-3 text-sm font-heading font-semibold hover:opacity-90"
        >
          Continue to Flashcards <ArrowRight size={16} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-9"
    >
      <StepIndicator step={step} />

      <AnimatePresence mode="wait">
        {step === "personal" && (
          <PersonalStep key="personal"
            displayName={displayName} setDisplayName={setDisplayName}
            age={age} setAge={setAge}
            city={city} setCity={setCity}
            gender={gender} setGender={setGender}
            job={job} setJob={setJob}
            academic={academic} setAcademic={setAcademic}
            motherLang={motherLang} setMotherLang={setMotherLang}
            otherLangs={otherLangs} setOtherLangs={setOtherLangs}
            purpose={purpose} setPurpose={setPurpose}
            selfCefr={selfCefr} setSelfCefr={setSelfCefr}
            readingStyles={readingStyles} toggleStyle={toggleStyle}
            onNext={handlePersonalNext}
          />
        )}
        {step === "interests" && (
          <InterestsStep key="interests"
            selected={selectedInterests}
            onToggle={toggleInterest}
            onNext={handleInterestsNext}
          />
        )}
        {step === "assessment" && (
          <AssessmentStep key="assessment"
            batch={batch}
            batchNum={batchNum}
            knownIds={knownIds}
            loading={loadingBatch}
            onToggle={toggleWord}
            onNext={handleNextBatch}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Step Indicator ────────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "personal",   label: "About you" },
    { key: "interests",  label: "Interests" },
    { key: "assessment", label: "Word check" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-3 mb-7">
      {steps.map((s, i) => {
        const done   = i < idx;
        const active = i === idx;
        return (
          <div key={s.key} className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <motion.div
                animate={{ backgroundColor: active ? "#0D7377" : done ? "#0D737740" : "#e7e5e4", scale: active ? 1.1 : 1 }}
                className="w-6 h-6 rounded-full flex items-center justify-center"
              >
                {done
                  ? <Check size={11} strokeWidth={3} className="text-primary" />
                  : <span className="text-xs font-heading font-bold" style={{ color: active ? "#fff" : "#a8a29e" }}>{i + 1}</span>
                }
              </motion.div>
              <span className="text-xs font-body font-semibold" style={{ color: active ? "#0D7377" : "#a8a29e" }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && <div className="h-px w-6 bg-black/10" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1 — Personal Info ────────────────────────────────────────────────────
function PersonalStep(props: {
  displayName: string; setDisplayName: (v: string) => void;
  age: number | ""; setAge: (v: number | "") => void;
  city: string; setCity: (v: string) => void;
  gender: string; setGender: (v: string) => void;
  job: string; setJob: (v: string) => void;
  academic: string; setAcademic: (v: string) => void;
  motherLang: string; setMotherLang: (v: string) => void;
  otherLangs: string; setOtherLangs: (v: string) => void;
  purpose: Purpose | ""; setPurpose: (v: Purpose | "") => void;
  selfCefr: string; setSelfCefr: (v: string) => void;
  readingStyles: ReadingStyle[]; toggleStyle: (s: ReadingStyle) => void;
  onNext: () => void;
}) {
  const canContinue = 
    props.displayName.trim().length >= 2 && 
    props.age !== "" && 
    props.city.trim().length > 0 && 
    props.gender !== "" && 
    props.job.trim().length > 0 && 
    props.academic.trim().length > 0 && 
    props.motherLang.trim().length > 0 && 
    props.purpose !== "" && 
    props.selfCefr !== "" && 
    props.readingStyles.length > 0;
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
      <h1 className="font-heading text-2xl font-bold text-text mb-1">Tell us about yourself</h1>
      <p className="text-sm text-text/50 font-body mb-6">This helps us personalise your reading texts.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name *"><input value={props.displayName} onChange={(e) => props.setDisplayName(e.target.value)} placeholder="Your name" className={inputCls} /></Field>
        <Field label="Age *"><input type="number" min={10} max={99} value={props.age} onChange={(e) => props.setAge(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 24" className={inputCls} /></Field>
        <Field label="City *"><input value={props.city} onChange={(e) => props.setCity(e.target.value)} placeholder="e.g. Amsterdam" className={inputCls} /></Field>
        <Field label="Gender *">
          <select value={props.gender} onChange={(e) => props.setGender(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {GENDERS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Job / occupation *"><input value={props.job} onChange={(e) => props.setJob(e.target.value)} placeholder="e.g. Software engineer" className={inputCls} /></Field>
        <Field label="Academic background *"><input value={props.academic} onChange={(e) => props.setAcademic(e.target.value)} placeholder="e.g. BSc Computer Science" className={inputCls} /></Field>
        <Field label="Mother language *"><input value={props.motherLang} onChange={(e) => props.setMotherLang(e.target.value)} placeholder="e.g. Arabic" className={inputCls} /></Field>
        <Field label="Other languages (optional)"><input value={props.otherLangs} onChange={(e) => props.setOtherLangs(e.target.value)} placeholder="e.g. English, French" className={inputCls} /></Field>
        <Field label="Purpose of learning Dutch *">
          <select value={props.purpose} onChange={(e) => props.setPurpose(e.target.value as Purpose | "")} className={inputCls}>
            <option value="">Select…</option>
            {PURPOSES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Self-reported Dutch level *">
          <select value={props.selfCefr} onChange={(e) => props.setSelfCefr(e.target.value)} className={inputCls}>
            <option value="">Select...</option>
            {CEFR_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-5">
        <p className="text-xs font-body font-semibold text-text/60 uppercase tracking-wide mb-2">
          Preferred reading styles <span className="normal-case font-normal text-text/40">(select up to 6)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {READING_STYLES.map((s) => {
            const on = props.readingStyles.includes(s);
            return (
              <button key={s} type="button" onClick={() => props.toggleStyle(s)}
                className={["px-3 py-1.5 rounded-full text-xs font-body font-semibold border transition-all", on ? "bg-primary text-white border-primary" : "border-black/12 text-text/60 hover:border-black/25"].join(" ")}>
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={props.onNext} disabled={!canContinue}
        className={["mt-7 w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-heading font-semibold transition-all", canContinue ? "bg-primary text-white hover:opacity-90" : "bg-black/6 text-text/30 cursor-not-allowed"].join(" ")}>
        Continue to Interests <ArrowRight size={16} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ── Step 2 — Interests ────────────────────────────────────────────────────────
function InterestsStep({ selected, onToggle, onNext }: {
  selected: Set<InterestId>;
  onToggle: (id: InterestId) => void;
  onNext: () => void;
}) {
  const canContinue = selected.size >= 1;
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
      <h1 className="font-heading text-2xl font-bold text-text mb-1">What are you interested in?</h1>
      <p className="text-sm text-text/50 font-body mb-6">Pick topics you'd like to read about. You can select up to 6.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {INTERESTS.map((interest) => {
          const isSelected = selected.has(interest.id);
          const atMax = selected.size >= 6 && !isSelected;
          const Icon = interest.icon;
          return (
            <button key={interest.id} type="button" onClick={() => !atMax && onToggle(interest.id)}
              disabled={atMax}
              className={["relative flex flex-col items-center gap-2.5 rounded-xl border-2 px-3 py-4 text-center select-none transition-colors duration-150",
                isSelected ? "border-primary bg-primary/6 shadow-sm" : atMax ? "border-black/8 bg-black/[0.02] opacity-40 cursor-not-allowed" : "border-black/10 bg-white hover:border-black/20 cursor-pointer"].join(" ")}
              style={isSelected ? { borderColor: interest.color, backgroundColor: `${interest.color}0f` } : {}}>
              {isSelected && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: interest.color }}>
                  <Check size={9} strokeWidth={3} className="text-white" />
                </span>
              )}
              <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ backgroundColor: isSelected ? `${interest.color}20` : "#f5f5f4" }}>
                <Icon size={20} strokeWidth={1.8} style={{ color: isSelected ? interest.color : "#a8a29e" }} />
              </div>
              <span className="text-xs font-body font-semibold leading-tight" style={{ color: isSelected ? interest.color : "#78716c" }}>
                {interest.label}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onNext} disabled={!canContinue}
        className={["mt-7 w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-heading font-semibold transition-all", canContinue ? "bg-primary text-white hover:opacity-90" : "bg-black/6 text-text/30 cursor-not-allowed"].join(" ")}>
        Continue to Word Check <ArrowRight size={16} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ── Step 3 — Assessment ────────────────────────────────────────────────────────
function AssessmentStep({ batch, batchNum, knownIds, loading, onToggle, onNext }: {
  batch: Awaited<ReturnType<typeof getAssessmentBatch>> | null;
  batchNum: number; knownIds: Set<string>; loading: boolean;
  onToggle: (id: string) => void; onNext: () => void;
}) {
  const words = batch?.success ? batch.data.words.filter((w) => !w.isPseudo) : [];
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-heading text-2xl font-bold text-text">Vocabulary check</h1>
        <span className="text-xs font-body text-text/40">Batch {batchNum} of {TOTAL_BATCHES}</span>
      </div>
      <p className="text-sm text-text/50 font-body mb-5">Click the words you recognise. Leave unknown ones unselected.</p>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Hourglass size={32} className="text-primary animate-pulse mb-4" />
          <p className="text-sm font-body text-text/60 font-medium mb-6 animate-pulse">
            Analyzing your Dutch level to prepare your custom challenge...
          </p>
          <div className="flex flex-wrap gap-2.5 justify-center opacity-40">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="h-8 rounded-full bg-black/10 animate-pulse" style={{ width: `${60 + (i % 5) * 18}px` }} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5 max-h-72 overflow-y-auto pr-1">
          {words.map((w) => {
            const known = knownIds.has(w.wordId);
            return (
              <button key={w.wordId} type="button" onClick={() => onToggle(w.wordId)}
                className={["flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-body font-medium border transition-all select-none",
                  known ? "bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm" : "bg-black/[0.025] border-black/10 text-text/60 hover:border-black/20 hover:bg-black/[0.04]"].join(" ")}>
                {known && <Check size={12} strokeWidth={3} className="text-emerald-600" />}
                {w.dutch}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <button type="button" onClick={onNext} disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-heading font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {batchNum < TOTAL_BATCHES ? "Next batch" : "See my results"} <ArrowRight size={16} />
        </button>
      </div>
    </motion.div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-black/12 bg-black/[0.02] px-3.5 py-2.5 text-sm font-body text-text placeholder:text-text/30 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-body font-semibold text-text/60 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

