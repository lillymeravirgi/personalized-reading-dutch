import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Clock, AlignLeft, ChevronRight, Sparkles } from "lucide-react";

// ── Mock data ─────────────────────────────────────────────────────────────────

const STATS = [
  { label: "Available Articles", value: 2 },
  { label: "Completed",          value: 0 },
  { label: "To Read",            value: 2 },
];

const ARTICLES = [
  {
    id: "1",
    title: "Het Nederlandse Ontbijt",
    subtitle: "The Dutch Breakfast",
    level: "beginner",
    minutes: 3,
    paragraphs: 3,
  },
  {
    id: "2",
    title: "Fietsen in Nederland",
    subtitle: "Cycling in the Netherlands",
    level: "beginner",
    minutes: 4,
    paragraphs: 3,
  },
];

const LEVEL_COLORS: Record<string, string> = {
  beginner:     "bg-yellow-100 text-yellow-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced:     "bg-purple-100 text-purple-700",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReadingPage() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-2xl mx-auto space-y-6"
    >
      {/* ── Page heading ── */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-text flex items-center gap-2">
          <BookOpen size={24} className="text-primary" />
          Reading Practice
        </h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Read authentic Dutch articles with vocabulary support
        </p>
      </div>

      {/* ── AI banner ── */}
      <div className="relative overflow-hidden rounded-2xl p-4 flex items-center justify-between"
        style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", border: "1px solid #fcd34d" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#f59e0b" }}
          >
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <p className="font-heading font-semibold text-sm text-amber-900">
              Create Personalized Story
            </p>
            <p className="text-xs text-amber-700 font-body mt-0.5">
              AI-powered reading tailored to your interests and level
            </p>
          </div>
        </div>
        <button
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-heading font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#f59e0b" }}
        >
          <Sparkles size={12} />
          Try Now
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-3">
        {STATS.map(({ label, value }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-black/8 px-4 py-4"
          >
            <p className="font-heading text-2xl font-bold text-text">{value}</p>
            <p className="text-xs text-text/45 font-body mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Article list ── */}
      <div className="space-y-3">
        {ARTICLES.map((article, i) => (
          <motion.button
            key={article.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => navigate(`/read/${article.id}`)}
            className="w-full text-left bg-white rounded-2xl border border-black/8 px-5 py-4 flex items-center justify-between hover:border-primary/30 hover:shadow-sm transition-all group"
          >
            <div className="space-y-1.5">
              <p className="font-heading font-semibold text-base text-text group-hover:text-primary transition-colors">
                {article.title}
              </p>
              <p className="text-xs text-text/45 font-body italic">
                {article.subtitle}
              </p>
              <div className="flex items-center gap-3 pt-0.5">
                <span className={`text-xs font-body font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[article.level]}`}>
                  {article.level}
                </span>
                <span className="flex items-center gap-1 text-xs text-text/40 font-body">
                  <Clock size={11} />
                  {article.minutes} min
                </span>
                <span className="flex items-center gap-1 text-xs text-text/40 font-body">
                  <AlignLeft size={11} />
                  {article.paragraphs} paragraphs
                </span>
              </div>
            </div>
            <ChevronRight
              size={18}
              className="text-text/25 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-4"
            />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}