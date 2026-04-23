import { motion, AnimatePresence } from "framer-motion";
import { RotateCw } from "lucide-react";
import type { FlashcardItem as FlashcardItemType } from "../../types";

type Props = {
  card: FlashcardItemType;
  flipped: boolean;
  onFlip: () => void;
  onRate: (remembered: boolean) => void;
};

export default function FlashcardItem({ card, flipped, onFlip, onRate }: Props) {
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      {/* Card */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !flipped && onFlip()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !flipped) {
            e.preventDefault();
            onFlip();
          }
        }}
        className="relative w-full aspect-[3/2] max-w-lg cursor-pointer select-none"
        style={{ perspective: 1200 }}
      >
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full h-full"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Front — Dutch word */}
          <CardFace>
            <ModeBadge mode={card.mode} />
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6">
              <p className="text-xs font-body text-text/40 uppercase tracking-wide">
                Dutch
              </p>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-text text-center break-words">
                {card.dutch}
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-body text-text/40 pb-4">
              <RotateCw size={12} />
              <span>Tap or press Space to flip</span>
            </div>
          </CardFace>

          {/* Back — English + example */}
          <CardFace back>
            <ModeBadge mode={card.mode} />
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 w-full">
              <div className="flex flex-col items-center gap-1">
                <p className="text-xs font-body text-text/40 uppercase tracking-wide">
                  English
                </p>
                <h2 className="font-heading text-2xl sm:text-3xl font-bold text-primary text-center break-words">
                  {card.english}
                </h2>
              </div>
              <div className="w-full max-w-sm rounded-xl bg-black/[0.03] border border-black/6 px-4 py-3">
                <p className="text-xs font-body text-text/40 uppercase tracking-wide mb-1.5">
                  Example
                </p>
                <p className="text-sm font-body text-text/85 italic leading-relaxed">
                  "{card.exampleSentence.nl}"
                </p>
                <p className="mt-1 text-[13px] font-body text-text/50 leading-relaxed">
                  {card.exampleSentence.en}
                </p>
              </div>
            </div>
            <div className="h-4" />
          </CardFace>
        </motion.div>
      </div>

      {/* Rate buttons (only after flip) */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center gap-10"
          >
            <RateIcon emoji="❌" title="Forgot (←)"     onClick={() => onRate(false)} />
            <RateIcon emoji="✅" title="Remembered (→)" onClick={() => onRate(true)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-components
function CardFace({
  children,
  back = false,
}: {
  children: React.ReactNode;
  back?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-between bg-white rounded-2xl shadow-xl shadow-black/10 border border-black/6 py-4"
      style={{
        backfaceVisibility: "hidden",
        transform: back ? "rotateY(180deg)" : undefined,
      }}
    >
      {children}
    </div>
  );
}

function ModeBadge({ mode }: { mode: "learning" | "review" }) {
  const meta =
    mode === "learning"
      ? { label: "Learning", color: "#F2A541", bg: "#FEF6E7" }
      : { label: "Review",   color: "#0D7377", bg: "#E0F2F1" };
  return (
    <div
      className="self-start ml-4 rounded-full px-2.5 py-0.5 text-xs font-heading font-semibold"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      {meta.label}
    </div>
  );
}

function RateIcon({
  emoji,
  title,
  onClick,
}: {
  emoji: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      whileTap={{ scale: 0.85 }}
      whileHover={{ scale: 1.12 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
      className="text-5xl leading-none select-none bg-transparent outline-none focus:outline-none"
      style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.12))" }}
    >
      {emoji}
    </motion.button>
  );
}
