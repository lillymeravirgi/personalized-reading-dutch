import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Award,
  Tags,
  Check,
  AlertCircle,
  Save,
  RefreshCw,
} from "lucide-react";

import { saveProfile } from "../services/api";
import { useStore } from "../store";
import {
  INTERESTS,
  MIN_INTERESTS,
  MAX_INTERESTS,
  type InterestId,
} from "../constants/interests";

export default function SettingsPage() {
  const navigate = useNavigate();
  const user     = useStore((s) => s.user);
  const setUser  = useStore((s) => s.setUser);

  const [interests,    setInterestsSet] = useState<Set<InterestId>>(new Set());
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setInterestsSet(new Set(user.interests as InterestId[]));
  }, [user]);

  if (!user) return null;

  const dirty = !sameSet(interests, new Set(user.interests as InterestId[]));

  const validInterestCount =
    interests.size >= MIN_INTERESTS && interests.size <= MAX_INTERESTS;
  const canSave = dirty && validInterestCount;

  function toggleInterest(id: InterestId) {
    setInterestsSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_INTERESTS) next.add(id);
      return next;
    });
  }

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function handleSave() {
    if (!canSave || !user) return;
    setSaving(true);
    setError(null);
    try {
      const updated = {
        ...user,
        interests: Array.from(interests),
      };
      setUser(updated);
      await saveProfile(updated);
      flashToast("Settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-3xl space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SettingsIcon size={17} strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold text-text">Settings</h1>
            <p className="text-sm font-body text-text/50">
              Check your study details and update your topic choices.
            </p>
          </div>
        </div>
        {dirty && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-body font-semibold text-primary">
            Unsaved changes
          </span>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700 font-body"
          >
            <Check size={14} />
            {toast}
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-body"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <Section title="Study setup" icon={<UserIcon size={14} />}>
        <div className="divide-y divide-black/8">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-xs font-body font-semibold uppercase tracking-wide text-text/50">
                Username
              </p>
              <p className="mt-1 font-body text-sm text-text">{user.id}</p>
            </div>
            <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-body text-text/45">
              fixed
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg font-heading text-sm font-bold text-white"
                style={{ backgroundColor: "var(--color-secondary)" }}
              >
                {user.cefrLevel ?? "—"}
              </span>
              <div>
                <p className="flex items-center gap-1.5 text-xs font-body font-semibold uppercase tracking-wide text-text/50">
                  <Award size={13} />
                  CEFR level
                </p>
                <p className="mt-1 text-sm font-body font-semibold text-text/75">
                  {user.assessedAt
                    ? `Assessed ${relDays(user.assessedAt)}`
                    : "Never assessed"}
                </p>
                <p className="mt-0.5 text-xs font-body text-text/45">
                  Set by the vocabulary assessment.
                </p>
              </div>
            </div>
            <motion.button
              type="button"
              onClick={() => navigate("/onboarding?step=assessment")}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/12 bg-white px-3 py-2 text-xs font-heading font-semibold text-text/80 hover:bg-black/[0.03] hover:border-black/20"
            >
              <RefreshCw size={12} />
              Retake
            </motion.button>
          </div>
        </div>

        <Field
          label="Interests"
          icon={<Tags size={13} />}
          hint={`${interests.size} selected · choose ${MIN_INTERESTS}–${MAX_INTERESTS}`}
        >
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {INTERESTS.map((it) => {
              const active = interests.has(it.id);
              const disabled = !active && interests.size >= MAX_INTERESTS;
              const Icon = it.icon;
              return (
                <motion.button
                  key={it.id}
                  type="button"
                  onClick={() => toggleInterest(it.id)}
                  disabled={disabled}
                  whileTap={disabled ? {} : { scale: 0.95 }}
                  className={[
                    "flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-body font-semibold transition-colors",
                    active
                      ? "border-primary bg-primary/[0.06] text-primary"
                      : disabled
                      ? "border-black/8 bg-black/[0.02] text-text/25 cursor-not-allowed"
                      : "border-black/12 bg-white text-text/65 hover:border-black/25 hover:bg-black/[0.02]",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  <Icon size={13} strokeWidth={1.8} />
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {active && <Check size={12} strokeWidth={2.8} />}
                </motion.button>
              );
            })}
          </div>
          {!validInterestCount && (
            <p className="mt-2 text-[11px] font-body text-red-500">
              Please pick between {MIN_INTERESTS} and {MAX_INTERESTS} interests.
            </p>
          )}
        </Field>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-4">
          <p className="text-xs font-body text-text/45">
            Topic choices affect the next generated reading where the assigned condition allows it.
          </p>
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            whileTap={canSave && !saving ? { scale: 0.97 } : {}}
            className={[
              "inline-flex items-center gap-2 rounded-xl px-5 py-2.5",
              "text-sm font-heading font-semibold transition-opacity",
              canSave && !saving
                ? "bg-primary text-white hover:opacity-90"
                : "bg-black/8 text-text/40 cursor-not-allowed",
            ].join(" ")}
          >
            {saving ? <Spinner /> : <Save size={14} />}
            Save
          </motion.button>
        </div>
      </Section>

    </motion.div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/8 bg-white px-5 py-5 shadow-sm shadow-black/5">
      <div className="mb-4 flex items-center gap-2">
        {icon && <span className="text-text/40">{icon}</span>}
        <h2 className="font-heading text-sm font-bold text-text uppercase tracking-wide">
          {title}
        </h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs font-body font-semibold text-text/60 uppercase tracking-wide">
          {icon && <span className="text-text/40">{icon}</span>}
          {label}
        </label>
        {hint && <span className="text-[11px] font-body text-text/40">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function sameSet<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function relDays(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffDays = Math.floor((Date.now() - then) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7)  return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 8)  return `${weeks} weeks ago`;
  return new Date(iso).toLocaleDateString();
}
