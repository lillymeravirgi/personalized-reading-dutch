import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings as SettingsIcon,
  User as UserIcon,
  Award,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  X,
  Save,
  RefreshCw,
} from "lucide-react";

import { changePassword, saveProfile } from "../services/api";
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

  // Local form state, initialised from the current user.
  const [displayName,  setDisplayName]  = useState("");
  const [interests,    setInterestsSet] = useState<Set<InterestId>>(new Set());
  const [pwOpen,       setPwOpen]       = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.name);
    setInterestsSet(new Set(user.interests as InterestId[]));
  }, [user]);

  if (!user) return null;

  const dirty =
    displayName !== user.name ||
    !sameSet(interests, new Set(user.interests as InterestId[]));

  const validInterestCount =
    interests.size >= MIN_INTERESTS && interests.size <= MAX_INTERESTS;
  const canSave = dirty && displayName.trim().length > 0 && validInterestCount;

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
        name: displayName.trim(),
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
      className="max-w-2xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
          <SettingsIcon size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">Settings</h1>
          <p className="text-sm font-body text-text/50">
            Update your profile and preferences.
          </p>
        </div>
      </div>

      {/* Toast / error */}
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

      {/* Account */}
      <Section title="Account" icon={<UserIcon size={14} />}>
        {/* Username (fixed login ID) */}
        <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-black/6">
          <div>
            <p className="text-[10px] font-heading font-semibold uppercase tracking-wide text-text/50">
              Username
            </p>
            <p className="text-sm font-body text-text/80 mt-0.5">{user.id}</p>
          </div>
          <span className="text-[10px] font-body text-text/40 italic">fixed</span>
        </div>

        {/* Preferred name (editable display name) */}
        <Field label="What would you like to be called?">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            placeholder="e.g. Alice"
            className="w-full rounded-xl border border-black/12 bg-white px-3.5 py-2.5 text-sm font-body text-text placeholder:text-text/30 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
          />
          <p className="mt-1.5 text-[11px] font-body text-text/40">
            Shown in greetings and the top bar. Does not affect research data.
          </p>
        </Field>

        {/* CEFR level (read-only; retake = re-run assessment) */}
        <Field label="CEFR level" icon={<Award size={13} />}>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-black/[0.02] px-4 py-3">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl font-heading text-sm font-bold text-white"
                style={{ backgroundColor: "var(--color-secondary)" }}
              >
                {user.cefrLevel ?? "—"}
              </span>
              <div>
                <p className="text-xs font-body font-semibold text-text/70">
                  {user.assessedAt
                    ? `Assessed ${relDays(user.assessedAt)}`
                    : "Never assessed"}
                </p>
                <p className="text-[11px] font-body text-text/45 mt-0.5">
                  Set automatically by the vocab assessment.
                </p>
              </div>
            </div>
            <motion.button
              type="button"
              onClick={() => navigate("/assessment")}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/12 bg-white px-3 py-2 text-xs font-heading font-semibold text-text/80 hover:bg-black/[0.03] hover:border-black/20"
            >
              <RefreshCw size={12} />
              Retake
            </motion.button>
          </div>
          <p className="mt-1.5 text-[11px] font-body text-text/40">
            Re-assess yourself weekly to keep the level accurate.
          </p>
        </Field>

        {/* Interests */}
        <Field
          label="Interests"
          icon={<Sparkles size={13} />}
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
                    "flex items-center gap-1.5 rounded-lg border-2 px-2.5 py-2 text-xs font-body font-semibold transition-colors",
                    active
                      ? "shadow-sm"
                      : disabled
                      ? "border-black/8 bg-black/[0.02] opacity-40 cursor-not-allowed"
                      : "border-black/10 bg-white hover:border-black/25 hover:bg-black/[0.02]",
                  ].join(" ")}
                  style={
                    active
                      ? { borderColor: it.color, backgroundColor: `${it.color}12`, color: it.color }
                      : { color: "#78716c" }
                  }
                >
                  <Icon size={13} strokeWidth={1.8} />
                  {it.label}
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

        {/* Save */}
        <div className="flex justify-end pt-2">
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
            Save changes
          </motion.button>
        </div>
      </Section>

      {/* Security */}
      <Section title="Security" icon={<Lock size={14} />}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-heading font-semibold text-text">
              Password
            </p>
            <p className="text-xs font-body text-text/50 mt-0.5">
              Change the password you use to log in.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={() => setPwOpen(true)}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-xl border border-black/12 bg-white px-4 py-2 text-sm font-heading font-semibold text-text/80 hover:bg-black/[0.03] hover:border-black/20"
          >
            <Lock size={13} />
            Change password
          </motion.button>
        </div>
      </Section>

      {/* Change Password modal */}
      <ChangePasswordModal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        username={user.id}
        onSuccess={() => flashToast("Password updated")}
      />
    </motion.div>
  );
}

// Section helpers
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
    <div className="bg-white rounded-2xl shadow-xl shadow-black/8 px-6 py-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        {icon && <span className="text-text/40">{icon}</span>}
        <h2 className="font-heading text-sm font-bold text-text uppercase tracking-wide">
          {title}
        </h2>
      </div>
      <div>{children}</div>
    </div>
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
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
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

// Change Password modal
function ChangePasswordModal({
  open,
  onClose,
  username,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  onSuccess: () => void;
}) {
  const [oldPw,      setOldPw]      = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [showOld,    setShowOld]    = useState(false);
  const [showNew,    setShowNew]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Reset form + listen for Escape while open.
  useEffect(() => {
    if (!open) return;
    setOldPw(""); setNewPw(""); setConfirmPw("");
    setShowOld(false); setShowNew(false);
    setError(null);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function validate(): string | null {
    if (!oldPw) return "Current password is required.";
    if (newPw.length < 4) return "New password must be at least 4 characters.";
    if (newPw === oldPw) return "New password must differ from the current one.";
    if (newPw !== confirmPw) return "Password confirmation does not match.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); return; }
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(username, oldPw, newPw);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-black/20 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b border-black/5">
              <div>
                <h2 className="font-heading text-lg font-bold text-text">
                  Change password
                </h2>
                <p className="text-xs font-body text-text/50 mt-0.5">
                  Pick a new password of at least 4 characters.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-black/5 text-text/50"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="px-6 py-5 space-y-4">
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5"
                  >
                    <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700 font-body">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <PwField
                label="Current password"
                id="cp-old"
                value={oldPw}
                onChange={setOldPw}
                show={showOld}
                onToggleShow={() => setShowOld((v) => !v)}
                autoComplete="current-password"
              />
              <PwField
                label="New password"
                id="cp-new"
                value={newPw}
                onChange={setNewPw}
                show={showNew}
                onToggleShow={() => setShowNew((v) => !v)}
                autoComplete="new-password"
              />
              <PwField
                label="Confirm new password"
                id="cp-conf"
                value={confirmPw}
                onChange={setConfirmPw}
                show={showNew}
                onToggleShow={() => setShowNew((v) => !v)}
                autoComplete="new-password"
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-4 py-2.5 text-sm font-heading font-semibold text-text/70 hover:bg-black/5"
                >
                  Cancel
                </button>
                <motion.button
                  type="submit"
                  disabled={submitting}
                  whileTap={{ scale: submitting ? 1 : 0.97 }}
                  className={[
                    "inline-flex items-center gap-2 rounded-xl px-5 py-2.5",
                    "text-sm font-heading font-semibold text-white bg-primary",
                    submitting ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
                  ].join(" ")}
                >
                  {submitting ? <Spinner /> : "Update password"}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PwField({
  label,
  id,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-body font-semibold text-text/60 uppercase tracking-wide"
      >
        {label}
      </label>
      <div className="flex items-center gap-3 rounded-xl border border-black/12 bg-black/[0.02] px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 hover:border-black/20">
        <Lock size={15} className="text-text/30" />
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent text-sm font-body text-text placeholder:text-text/30 outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggleShow}
          className="text-text/30 hover:text-text/60 transition-colors"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}
