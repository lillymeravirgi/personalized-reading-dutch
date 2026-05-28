import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ClipboardCheck } from "lucide-react";

import { getDelayedVocabTestStatus, type DelayedVocabTestStatus } from "../services/api";
import { useStore } from "../store";

const DELAYED_CHECK_POLL_MS = 10_000;
const DELAYED_CHECK_SNOOZE_MS = 60 * 60 * 1000;

export default function DelayedVocabReminder() {
  const user = useStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [delayedCheck, setDelayedCheck] = useState<DelayedVocabTestStatus | null>(null);

  useEffect(() => {
    if (!user?.id || !user.onboarding_completed || shouldSkipReminder(location.pathname)) return;

    const userId = user.id;
    let cancelled = false;

    async function checkDelayedTest() {
      try {
        const status = await getDelayedVocabTestStatus(userId);
        if (cancelled) return;
        const key = status.sessionGroupId && status.studyPhase
          ? `${status.sessionGroupId}-${status.studyPhase}`
          : null;
        if (status.due && key && !isDelayedCheckSnoozed(key)) {
          setDelayedCheck(status);
        }
      } catch {
        // Try again on the next poll.
      }
    }

    void checkDelayedTest();
    const timer = window.setInterval(() => void checkDelayedTest(), DELAYED_CHECK_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user?.id, user?.onboarding_completed, location.pathname]);

  function startDelayedCheck() {
    if (!delayedCheck?.sessionGroupId || !delayedCheck.studyPhase) return;
    const path = `/vocab-test/${delayedCheck.sessionGroupId}?phase=${delayedCheck.studyPhase}&test=delayed`;
    setDelayedCheck(null);
    navigate(path);
  }

  function closeDelayedCheck() {
    if (delayedCheck?.sessionGroupId && delayedCheck.studyPhase) {
      snoozeDelayedCheck(`${delayedCheck.sessionGroupId}-${delayedCheck.studyPhase}`);
    }
    setDelayedCheck(null);
  }

  return (
    <AnimatePresence>
      {delayedCheck?.due && (
        <DelayedVocabCheckModal
          onStart={startDelayedCheck}
          onLater={closeDelayedCheck}
        />
      )}
    </AnimatePresence>
  );
}

function shouldSkipReminder(pathname: string): boolean {
  return pathname.startsWith("/vocab-test")
    || pathname.startsWith("/login")
    || pathname.startsWith("/register")
    || pathname.startsWith("/onboarding")
    || pathname.startsWith("/read/")
    || pathname.startsWith("/survey/");
}

function isDelayedCheckSnoozed(key: string): boolean {
  const raw = window.localStorage.getItem(`delayed-vocab-snooze-${key}`);
  if (!raw) return false;
  const until = Number(raw);
  if (!Number.isFinite(until)) return false;
  return Date.now() < until;
}

function snoozeDelayedCheck(key: string) {
  window.localStorage.setItem(
    `delayed-vocab-snooze-${key}`,
    String(Date.now() + DELAYED_CHECK_SNOOZE_MS),
  );
}

function DelayedVocabCheckModal({
  onStart,
  onLater,
}: {
  onStart: () => void;
  onLater: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-2xl border border-black/8 bg-white p-6 shadow-2xl shadow-black/20"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ClipboardCheck size={20} />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold text-text">
              24-hour vocabulary check
            </h2>
            <p className="mt-1 text-sm font-body leading-6 text-text/60">
              Your 24-hour vocabulary check is ready. It helps us measure retention from your previous session.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onLater}
            className="rounded-xl border border-black/10 px-4 py-2.5 text-sm font-heading font-semibold text-text/65 hover:bg-black/[0.03]"
          >
            Later today
          </button>
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-heading font-semibold text-white hover:opacity-90"
          >
            Start check <ArrowRight size={15} />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
