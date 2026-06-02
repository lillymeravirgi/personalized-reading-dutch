import { motion } from "framer-motion";
import { CheckCircle2, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ThankYouPage() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 px-6"
    >
      <div className="w-full max-w-lg text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full"
          style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
        >
          <CheckCircle2 size={46} className="text-white" strokeWidth={2} />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.45 }}
          className="font-heading text-4xl font-bold text-white mb-4 leading-tight"
        >
          You have completed<br />the study
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.45 }}
          className="text-base text-white/70 font-body leading-relaxed mb-10"
        >
          Thank you for participating in our Dutch reading research. Your contributions
          will help us improve Dutch reading support for future learners.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.45 }}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-7 py-6 text-left space-y-4 mb-8"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-300" />
            <p className="text-sm font-body text-white/80">Six reading sessions completed</p>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-300" />
            <p className="text-sm font-body text-white/80">Immediate and delayed vocabulary checks completed</p>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-emerald-300" />
            <p className="text-sm font-body text-white/80">Your responses and interaction data have been securely saved.</p>
          </div>
        </motion.div>

        <motion.button
          type="button"
          onClick={() => navigate("/home")}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.45 }}
          className="mb-6 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-heading text-sm font-semibold text-emerald-900 shadow-lg shadow-black/15 hover:bg-white/90"
        >
          <Home size={16} />
          Back to home
        </motion.button>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.65, duration: 0.45 }}
          className="text-sm text-white/40 font-body"
        >
          You may now close this browser window. Please let the researcher know you are finished.
        </motion.p>

        <p className="mt-8 text-xs text-white/20 font-body">
          Leeswijs · Within-Subjects Crossover Study · All data is anonymised.
        </p>
      </div>
    </motion.div>
  );
}
