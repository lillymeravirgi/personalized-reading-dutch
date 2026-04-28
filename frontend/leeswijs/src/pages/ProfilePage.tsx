import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Trophy, BookOpen, Star, Flame, TrendingUp } from "lucide-react";

// ── Mock data ─────────────────────────────────────────────────────────────────

const STATS = [
  { label: "Average Score",      value: "0%", color: "text-orange-500", bg: "#fee2e2", iconBg: "#ef4444", Icon: Trophy },
  { label: "Articles Completed", value: "0",  color: "text-primary",    bg: "#ccfbf1", iconBg: "#0d9488", Icon: BookOpen },
  { label: "Words Learned",      value: "0",  color: "text-secondary",  bg: "#fef3c7", iconBg: "#f59e0b", Icon: Star },
  { label: "Day Streak",         value: "0",  color: "text-orange-500", bg: "#ffedd5", iconBg: "#f97316", Icon: Flame },
];

const ACHIEVEMENTS = [
  { id: "first",  Icon: Trophy,   title: "First Steps",    desc: "Complete your first article", unlocked: false },
  { id: "roll",   Icon: Trophy,   title: "On a Roll",      desc: "Complete 3 articles",          unlocked: false },
  { id: "master", Icon: BookOpen, title: "Master Learner", desc: "Complete all articles",        unlocked: false },
];

const TOTAL_ARTICLES     = 5;
const COMPLETED_ARTICLES = 0;
const PROGRESS_PCT       = Math.round((COMPLETED_ARTICLES / TOTAL_ARTICLES) * 100);

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* ── Page heading ── */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-text flex items-center gap-2">
          <User size={24} className="text-primary" />
          Your Progress
        </h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Track your learning journey and achievements
        </p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex gap-6 items-start">

        {/* ── LEFT: stats ── */}
        <div className="flex flex-col gap-3 w-72 shrink-0">
          {STATS.map(({ label, value, color, bg, iconBg, Icon }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="bg-white rounded-2xl border border-black/8 px-4 py-4 flex items-center gap-3"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: bg }}
              >
                <Icon size={18} style={{ color: iconBg }} />
              </div>
              <div>
                <p className={`font-heading text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-text/45 font-body mt-0.5">{label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── RIGHT: progress + achievements + empty state ── */}
        <div className="flex-1 flex flex-col gap-4">

          {/* Overall progress card */}
          <div className="bg-white rounded-2xl border border-black/8 px-5 py-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-heading font-semibold text-base text-text">Overall Progress</p>
              <p className="font-heading font-bold text-base text-text/50">{PROGRESS_PCT}%</p>
            </div>
            <div className="w-full h-2.5 rounded-full bg-red-100 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${PROGRESS_PCT}%` }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                className="h-full rounded-full bg-red-400"
              />
            </div>
            <p className="text-xs text-text/40 font-body">
              {COMPLETED_ARTICLES} of {TOTAL_ARTICLES} articles completed
            </p>
          </div>

          {/* Achievements */}
          <div className="space-y-3">
            <p className="font-heading font-semibold text-base text-text">Achievements</p>
            <div className="grid grid-cols-3 gap-3">
              {ACHIEVEMENTS.map(({ id, Icon, title, desc, unlocked }, i) => (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={[
                    "bg-white rounded-2xl border px-4 py-4 flex flex-col items-start gap-2",
                    unlocked ? "border-primary/30" : "border-black/8 opacity-60",
                  ].join(" ")}
                >
                  <Icon size={20} className={unlocked ? "text-primary" : "text-text/25"} />
                  <div>
                    <p className="font-heading font-semibold text-sm text-text">{title}</p>
                    <p className="text-xs text-text/40 font-body mt-0.5">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Empty state */}
          <div className="bg-white rounded-2xl border border-black/8 px-5 py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center">
              <TrendingUp size={22} className="text-text/25" />
            </div>
            <div>
              <p className="font-heading font-semibold text-base text-text">No progress yet</p>
              <p className="text-sm text-text/45 font-body mt-1">
                Start your first article to track your progress!
              </p>
            </div>
            <button
              onClick={() => navigate("/read")}
              className="mt-1 px-5 py-2.5 rounded-xl text-sm font-heading font-semibold text-white bg-secondary hover:opacity-90 transition-opacity"
            >
              Browse Articles
            </button>
          </div>

        </div>
      </div>
    </motion.div>
  );
}