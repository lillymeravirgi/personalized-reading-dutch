import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, BookOpen, Layers, Trophy, Flame, TrendingUp, ChevronRight, Clock, AlignLeft, Star, ArrowRight } from "lucide-react";

// ── Mock data ─────────────────────────────────────────────────────────────────

const STATS = [
  { label: "Articles Completed", value: "0",  color: "text-primary",    bg: "#ccfbf1", iconBg: "#0d9488", Icon: BookOpen },
  { label: "Total Articles",     value: "5",  color: "text-text",       bg: "#f3f4f6", iconBg: "#6b7280", Icon: AlignLeft },
  { label: "Progress",           value: "0%", color: "text-orange-500", bg: "#fee2e2", iconBg: "#ef4444", Icon: TrendingUp },
  { label: "Day Streak",         value: "0",  color: "text-orange-500", bg: "#ffedd5", iconBg: "#f97316", Icon: Flame },
];

const ARTICLES = [
  {
    id: "1",
    title: "Het Nederlandse Ontbijt",
    subtitle: "The Dutch Breakfast",
    level: "beginner",
    minutes: 3,
    paragraphs: 3,
    unlocked: true,
  },
  {
    id: "2",
    title: "Fietsen in Nederland",
    subtitle: "Cycling in the Netherlands",
    level: "beginner",
    minutes: 4,
    paragraphs: 3,
    unlocked: false,
  },
  {
    id: "3",
    title: "Typisch Nederlands Eten",
    subtitle: "Typical Dutch Food",
    level: "beginner",
    minutes: 4,
    paragraphs: 4,
    unlocked: false,
  },
];

const CATEGORIES = [
  { id: "greetings", title: "Greetings", cards: 3, color: "#ef4444", bg: "#fee2e2", tags: ["Hallo", "Dank je wel"] },
  { id: "food",      title: "Food",      cards: 3, color: "#0d9488", bg: "#ccfbf1", tags: ["Voedzaam", "Lekker"] },
  { id: "travel",    title: "Travel",    cards: 2, color: "#f59e0b", bg: "#fef3c7", tags: ["Fietsen"] },
];

const LEVEL_COLORS: Record<string, string> = {
  beginner:     "bg-yellow-100 text-yellow-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced:     "bg-purple-100 text-purple-700",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-5xl mx-auto space-y-8"
    >
      {/* ── Greeting ── */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-text flex items-center gap-2">
          <Home size={24} className="text-primary" />
          Welcome back! 👋
        </h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Continue your Dutch learning journey
        </p>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map(({ label, value, color, bg, iconBg, Icon }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white rounded-2xl border border-black/8 px-4 py-4 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
              <Icon size={16} style={{ color: iconBg }} />
            </div>
            <div>
              <p className={`font-heading text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-text/45 font-body mt-0.5">{label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Quick action banners ── */}
      <div className="flex flex-col gap-3">
        {/* Flashcards due */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => navigate("/flashcards")}
          className="w-full text-left rounded-2xl p-4 flex items-center justify-between hover:opacity-90 transition-opacity group"
          style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", border: "1px solid #fcd34d" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#f59e0b" }}>
              <Layers size={18} className="text-white" />
            </div>
            <div>
              <p className="font-heading font-semibold text-sm text-amber-900">10 Flashcards Due</p>
              <p className="text-xs text-amber-700 font-body mt-0.5">Review your vocabulary with spaced repetition</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-amber-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
        </motion.button>

        {/* Practice reading */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.27, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => navigate("/read")}
          className="w-full text-left rounded-2xl p-4 flex items-center justify-between hover:opacity-90 transition-opacity group"
          style={{ background: "linear-gradient(135deg, #ccfbf1 0%, #99f6e4 100%)", border: "1px solid #5eead4" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#0d9488" }}>
              <BookOpen size={18} className="text-white" />
            </div>
            <div>
              <p className="font-heading font-semibold text-sm text-teal-900">Practice Reading</p>
              <p className="text-xs text-teal-700 font-body mt-0.5">Read authentic Dutch articles with vocabulary support</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-teal-500 group-hover:translate-x-0.5 transition-transform shrink-0" />
        </motion.button>
      </div>

      {/* ── Two-column: articles + flashcard categories ── */}
      <div className="flex gap-6 items-start">

        {/* LEFT: Articles */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-heading font-semibold text-base text-text">Your Articles</p>
            <button
              onClick={() => navigate("/read")}
              className="text-xs font-body font-semibold text-primary hover:opacity-70 transition-opacity flex items-center gap-1"
            >
              View all <ChevronRight size={13} />
            </button>
          </div>
          {ARTICLES.map((article, i) => (
            <motion.button
              key={article.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => article.unlocked && navigate(`/read/${article.id}`)}
              className={[
                "w-full text-left bg-white rounded-2xl border border-black/8 px-5 py-4 flex items-center justify-between transition-all group",
                article.unlocked
                  ? "hover:border-primary/30 hover:shadow-sm cursor-pointer"
                  : "opacity-60 cursor-not-allowed",
              ].join(" ")}
            >
              <div className="space-y-1.5 min-w-0">
                <p className={`font-heading font-semibold text-sm text-text truncate ${article.unlocked ? "group-hover:text-primary transition-colors" : ""}`}>
                  {article.title}
                </p>
                <p className="text-xs text-text/45 font-body italic">{article.subtitle}</p>
                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                  <span className={`text-xs font-body font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[article.level]}`}>
                    {article.level}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-text/40 font-body">
                    <Clock size={10} />{article.minutes} min
                  </span>
                  <span className="flex items-center gap-1 text-xs text-text/40 font-body">
                    <AlignLeft size={10} />{article.paragraphs} paragraphs
                  </span>
                </div>
                {!article.unlocked && (
                  <p className="text-xs text-text/35 font-body">Complete previous article to unlock</p>
                )}
              </div>
              <ChevronRight
                size={16}
                className={`shrink-0 ml-3 transition-all ${article.unlocked ? "text-text/25 group-hover:text-primary group-hover:translate-x-0.5" : "text-text/15"}`}
              />
            </motion.button>
          ))}
        </div>

        {/* RIGHT: Flashcard categories */}
        <div className="flex flex-col gap-3 w-64 shrink-0">
          <div className="flex items-center justify-between">
            <p className="font-heading font-semibold text-base text-text">Flashcard Sets</p>
            <button
              onClick={() => navigate("/flashcards")}
              className="text-xs font-body font-semibold text-primary hover:opacity-70 transition-opacity flex items-center gap-1"
            >
              View all <ChevronRight size={13} />
            </button>
          </div>
          {CATEGORIES.map((cat, i) => (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => navigate(`/flashcards/${cat.id}`)}
              className="w-full text-left bg-white rounded-2xl border border-black/8 px-4 py-3.5 flex items-center gap-3 hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat.bg }}>
                <Layers size={16} style={{ color: cat.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-semibold text-sm text-text group-hover:text-primary transition-colors">
                  {cat.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {cat.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-body font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: cat.bg, color: cat.color }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <ChevronRight size={14} className="text-text/25 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
            </motion.button>
          ))}

          {/* Progress teaser */}
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => navigate("/profile")}
            className="w-full text-left bg-white rounded-2xl border border-black/8 px-4 py-4 hover:border-primary/30 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy size={15} className="text-orange-400" />
                <p className="font-heading font-semibold text-sm text-text group-hover:text-primary transition-colors">
                  Your Progress
                </p>
              </div>
              <ChevronRight size={14} className="text-text/25 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="w-full h-2 rounded-full bg-red-100 overflow-hidden">
              <div className="h-full rounded-full bg-red-400" style={{ width: "0%" }} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-text/40 font-body">0 of 5 articles</p>
              <p className="text-xs font-heading font-semibold text-text/40">0%</p>
            </div>
          </motion.button>
        </div>

      </div>
    </motion.div>
  );
}