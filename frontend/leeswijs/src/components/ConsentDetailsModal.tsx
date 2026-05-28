import { X, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ConsentDetailsModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-4 pb-4 sm:items-center sm:pb-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl shadow-black/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-text">Study consent</h2>
                  <p className="text-xs font-body text-text/45">Before you continue</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-text/40 hover:bg-black/5"
                aria-label="Close consent details"
              >
                <X size={17} />
              </button>
            </div>

            <div className="space-y-3 text-sm font-body leading-relaxed text-text/65">
              <p>
                We ask for a small amount of study data so reading tasks can be prepared and the study results can be analysed.
              </p>
              <p>
                This includes your profile answers, topic choices, vocabulary responses, reading activity, and survey answers.
              </p>
              <p>
                Our team uses this information to evaluate different reading setups and improve the prototype.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-heading font-semibold text-white hover:opacity-90"
            >
              I understand
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
