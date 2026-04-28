import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Layers, Clock, ChevronRight, RotateCcw } from "lucide-react";

// ── Mock data ─────────────────────────────────────────────────────────────────

const STATS = [
  { label: "Total Cards", value: "10",  color: "text-primary" },
  { label: "Reviewed",    value: "0",   color: "text-primary" },
  { label: "Due Today",   value: "10",  color: "text-primary" },
  { label: "Progress",    value: "0%",  color: "text-secondary" },
];

const CATEGORIES = [
  {
    id: "greetings",
    title: "Greetings",
    cards: 3,
    color: "#ef4444",
    bg: "#fee2e2",
    tags: ["Hallo", "Dank je wel", "Alsjeblieft"],
  },
  {
    id: "food",
    title: "Food",
    cards: 3,
    color: "#0d9488",
    bg: "#ccfbf1",
    tags: ["Voedzaam", "Ontbijttafel", "Lekker"],
  },
  {
    id: "travel",
    title: "Travel",
    cards: 2,
    color: "#f59e0b",
    bg: "#fef3c7",
    tags: ["Fietsen", "Wandelen"],
  },
  {
    id: "conversation",
    title: "Conversation",
    cards: 2,
    color: "#0d9488",
    bg: "#ccfbf1",
    tags: ["Gezellig", "Gelukkig"],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function FlashcardsPage() {
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
          <Layers size={24} className="text-primary" />
          Flashcards
        </h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Master Dutch vocabulary with spaced repetition
        </p>
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex gap-6 items-start">

        {/* ── LEFT: review banner + stats ── */}
        <div className="flex flex-col gap-4 w-72 shrink-0">

          {/* Review banner */}
          <div
            className="relative overflow-hidden rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", border: "1px solid #fcd34d" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#f59e0b" }}
              >
                <Clock size={18} className="text-white" />
              </div>
              <div>
                <p className="font-heading font-semibold text-sm text-amber-900">
                  10 Cards Ready to Review
                </p>
                <p className="text-xs text-amber-700 font-body mt-0.5">
                  Keep your learning momentum going!
                </p>
              </div>
            </div>
            <button
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-heading font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#f59e0b" }}
            >
              <RotateCcw size={12} />
              Start Review
            </button>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-3">
            {STATS.map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-white rounded-2xl border border-black/8 px-4 py-4"
              >
                <p className={`font-heading text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-text/45 font-body mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: category list ── */}
        <div className="flex-1 flex flex-col gap-3">
          <p className="font-heading font-semibold text-base text-text">Browse by Category</p>
          {CATEGORIES.map((cat, i) => (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => navigate(`/flashcards/${cat.id}`)}
              className="w-full text-left bg-white rounded-2xl border border-black/8 px-5 py-4 flex items-center justify-between hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-4">
                {/* Category icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: cat.bg }}
                >
                  <Layers size={18} style={{ color: cat.color }} />
                </div>
                <div className="space-y-0.5">
                  <p className="font-heading font-semibold text-base text-text group-hover:text-primary transition-colors">
                    {cat.title}
                  </p>
                  <p className="text-xs text-text/45 font-body">
                    {cat.cards} cards
                  </p>
                </div>
              </div>

              {/* Tags + chevron */}
              <div className="flex items-center gap-2 ml-4">
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {cat.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-body font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: cat.bg, color: cat.color }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <ChevronRight
                  size={18}
                  className="text-text/25 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
                />
              </div>
            </motion.button>
          ))}
        </div>

      </div>
    </motion.div>
  );
}