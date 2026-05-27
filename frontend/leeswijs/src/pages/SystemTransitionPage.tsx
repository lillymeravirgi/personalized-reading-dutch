import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, RefreshCcw } from "lucide-react";
import { useStore } from "../store";
import { apiClient } from "../services/api";

export default function SystemTransitionPage() {
  const navigate    = useNavigate();
  const user        = useStore((s) => s.user);
  const setUser     = useStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);

  // On mount, if needed, fetch the updated user object so we have the new condition
  useEffect(() => {
    if (!user) return;
    // Trigger Phase 2 onboarding word selection in the background
    // studyPhase=2 tells the backend to use ADAPTIVE or BASELINE KRS
    // based on the user's now-flipped current_condition
    setLoading(true);
    apiClient
      .post(`/onboarding/words/${user.id}?study_phase=2`)
      .catch(() => { /* non-fatal — fallback exists in backend */ })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleContinue() {
    // Route to the standard onboarding flashcards page so participants
    // learn the 7 new Phase-2 words before reading
    navigate("/onboarding/flashcards?phase=2");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-6"
    >
      <div className="w-full max-w-lg">
        {/* Icon ring */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
        >
          <RefreshCcw size={34} className="text-white" strokeWidth={2} />
        </motion.div>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.45 }}
          className="text-center mb-8"
        >
          <h1 className="font-heading text-3xl font-bold text-white mb-3 leading-tight">
            Thank you for completing<br />the first reading block.
          </h1>
          <p className="text-base text-white/70 font-body leading-relaxed max-w-md mx-auto">
            You are now going to test a <span className="text-indigo-300 font-semibold">completely different reading system</span>.
          </p>
        </motion.div>

        {/* Info card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.45 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-7 py-6 mb-8 space-y-4"
        >
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 text-xl">👀</span>
            <p className="text-sm font-body text-white/80 leading-relaxed">
              Please pay close attention to how this new system <strong className="text-white">feels</strong> compared to the first one — especially the articles you are given to read.
            </p>
          </div>
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 text-xl">📝</span>
            <p className="text-sm font-body text-white/80 leading-relaxed">
              You will study <strong className="text-white">7 new words</strong> and then complete <strong className="text-white">3 more reading sessions</strong> followed by a final vocabulary test.
            </p>
          </div>
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 text-xl">🔬</span>
            <p className="text-sm font-body text-white/80 leading-relaxed">
              There are no right or wrong preferences. Simply engage with the system as naturally as possible.
            </p>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.45 }}
          className="flex justify-center"
        >
          <button
            type="button"
            id="transition-continue-btn"
            onClick={handleContinue}
            disabled={loading}
            className="inline-flex items-center gap-2.5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 px-8 py-4 text-base font-heading font-semibold text-white transition-all shadow-lg shadow-indigo-500/30 hover:shadow-indigo-400/40"
          >
            {loading ? "Preparing new words…" : "Begin Phase 2"}
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
        </motion.div>

        <p className="mt-6 text-center text-xs text-white/25 font-body">
          Leeswijs · Within-Subjects Crossover Study
        </p>
      </div>
    </motion.div>
  );
}
