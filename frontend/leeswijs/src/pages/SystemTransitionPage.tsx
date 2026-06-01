import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, RefreshCcw } from "lucide-react";

import { apiClient } from "../services/api";
import { useStore } from "../store";

export default function SystemTransitionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const phaseParam = Number.parseInt(searchParams.get("phase") ?? "2", 10);
  const nextPhase = Number.isFinite(phaseParam) ? Math.min(2, Math.max(2, phaseParam)) : 2;

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiClient
      .post(`/onboarding/words/${user.id}?study_phase=${nextPhase}`)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nextPhase, user]);

  function handleContinue() {
    navigate("/reading");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 px-6"
    >
      <div className="w-full max-w-lg">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
        >
          <RefreshCcw size={34} className="text-white" strokeWidth={2} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.45 }}
          className="text-center mb-8"
        >
          <h1 className="font-heading text-3xl font-bold text-white mb-3 leading-tight">
            Next word set
          </h1>
          <p className="text-base text-white/70 font-body leading-relaxed max-w-md mx-auto">
            You have completed this reading block.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.45 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-7 py-6 mb-8 space-y-4"
        >
          <p className="text-sm font-body text-white/80 leading-relaxed">
            Take a short moment, then continue when you are ready.
          </p>
          <p className="text-sm font-body text-white/80 leading-relaxed">
            Next, go back to the reading page. The next word set will unlock the following
            reading block.
          </p>
        </motion.div>

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
            {loading ? "Preparing words..." : "Continue to reading"}
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
        </motion.div>

        <p className="mt-6 text-center text-xs text-white/25 font-body">
          Leeswijs · Reading study
        </p>
      </div>
    </motion.div>
  );
}
