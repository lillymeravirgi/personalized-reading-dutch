import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight } from "lucide-react";
import { useStore } from "../store";
import { saveProfile } from "../services/api";
import {
  INTERESTS,
  MIN_INTERESTS as MIN,
  MAX_INTERESTS as MAX,
  type InterestId,
} from "../constants/interests";

// Component
export default function OnboardingPage() {
  const navigate = useNavigate();
  const setUser = useStore((s) => s.setUser);
  const user    = useStore((s) => s.user);

  const [selected, setSelected] = useState<Set<InterestId>>(new Set());

  function toggle(id: InterestId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX) {
        next.add(id);
      }
      return next;
    });
  }

  function handleContinue() {
    if (selected.size < MIN) return;
    if (user) {
      const updated = { ...user, interests: [...selected] };
      setUser(updated);
      // Persist so a logout-then-login cycle does not re-prompt (mock mode
      // writes to localStorage; real backend call lives inside saveProfile).
      void saveProfile(updated);
    }
    navigate("/assessment");
  }

  const count     = selected.size;
  const canSubmit = count >= MIN;
  const atMax     = count === MAX;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-9"
    >
      {/* Step indicator */}
      <StepIndicator current={1} total={2} />

      {/* Heading */}
      <div className="mt-6 mb-2">
        <h1 className="font-heading text-2xl font-bold text-text">
          What are you interested in?
        </h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Pick a few topics for your study profile.
        </p>
      </div>

      {/* Selection counter */}
      <div className="mb-5 flex items-center gap-2">
        <motion.span
          key={count}
          initial={{ scale: 1.3, color: "#0D7377" }}
          animate={{ scale: 1, color: count >= MIN ? "#0D7377" : "#9ca3af" }}
          transition={{ duration: 0.25 }}
          className="font-heading text-sm font-bold"
        >
          {count}
        </motion.span>
        <span className="text-sm text-text/40 font-body">of {MAX} selected</span>
        {atMax && (
          <motion.span
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="ml-1 text-xs font-body text-secondary font-semibold"
          >
            Maximum reached
          </motion.span>
        )}
      </div>

      {/* Interest grid */}
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-3 gap-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.055 } },
        }}
      >
        {INTERESTS.map((interest) => {
          const isSelected = selected.has(interest.id);
          const isDisabled = atMax && !isSelected;
          return (
            <InterestCard
              key={interest.id}
              interest={interest}
              isSelected={isSelected}
              isDisabled={isDisabled}
              onToggle={() => toggle(interest.id)}
            />
          );
        })}
      </motion.div>

      {/* Continue button */}
      <div className="mt-7">
        <motion.button
          type="button"
          disabled={!canSubmit}
          onClick={handleContinue}
          whileTap={canSubmit ? { scale: 0.97 } : {}}
          className={[
            "w-full flex items-center justify-center gap-2",
            "rounded-xl px-5 py-3 text-sm font-heading font-semibold",
            "transition-all duration-200",
            canSubmit
              ? "bg-primary text-white hover:opacity-90"
              : "bg-black/6 text-text/30 cursor-not-allowed",
          ].join(" ")}
        >
          Continue to Level Check
          <ArrowRight size={16} strokeWidth={2.5} />
        </motion.button>

        {!canSubmit && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 text-center text-xs text-text/35 font-body"
          >
            Pick at least {MIN} interests to continue
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

// InterestCard
interface CardProps {
  interest: (typeof INTERESTS)[number];
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: () => void;
}

function InterestCard({ interest, isSelected, isDisabled, onToggle }: CardProps) {
  const Icon = interest.icon;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 14, scale: 0.95 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      <motion.button
        type="button"
        onClick={onToggle}
        disabled={isDisabled}
        whileTap={!isDisabled ? { scale: 0.93 } : {}}
        whileHover={!isDisabled && !isSelected ? { y: -2 } : {}}
        animate={isSelected ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        transition={{ duration: 0.22 }}
        className={[
          "relative w-full flex flex-col items-center gap-2.5 rounded-xl",
          "border-2 px-3 py-4 text-center select-none",
          "transition-colors duration-150",
          isSelected
            ? "border-primary bg-primary/6 shadow-sm"
            : isDisabled
            ? "border-black/8 bg-black/[0.02] opacity-40 cursor-not-allowed"
            : "border-black/10 bg-white hover:border-black/20 hover:bg-black/[0.015] cursor-pointer",
        ].join(" ")}
        style={isSelected ? { borderColor: interest.color, backgroundColor: `${interest.color}0f` } : {}}
      >
        {/* Check badge */}
        <AnimatePresence>
          {isSelected && (
            <motion.span
              key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="absolute top-2 right-2 flex items-center justify-center w-4 h-4 rounded-full"
              style={{ backgroundColor: interest.color }}
            >
              <Check size={9} strokeWidth={3} className="text-white" />
            </motion.span>
          )}
        </AnimatePresence>

        {/* Icon */}
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors duration-150"
          style={{
            backgroundColor: isSelected ? `${interest.color}20` : "#f5f5f4",
          }}
        >
          <Icon
            size={20}
            strokeWidth={1.8}
            style={{ color: isSelected ? interest.color : "#a8a29e" }}
          />
        </div>

        {/* Label */}
        <span
          className="text-xs font-body font-semibold leading-tight transition-colors duration-150"
          style={{ color: isSelected ? interest.color : "#78716c" }}
        >
          {interest.label}
        </span>
      </motion.button>
    </motion.div>
  );
}

// StepIndicator
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }, (_, i) => {
        const step  = i + 1;
        const done  = step < current;
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
            {i < total - 1 && (
              <div className="h-px w-6 bg-black/10" />
            )}
          </div>
        );
      })}
    </div>
  );
}
