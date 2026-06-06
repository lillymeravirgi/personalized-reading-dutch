import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { KeyRound, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { login } from "../services/api";
import { useStore } from "../store";
import ConsentDetailsModal from "../components/ConsentDetailsModal";

function validateStudyId(value: string) {
  return value.trim().length >= 2
    ? null
    : "Enter your Study ID.";
}

function validatePassword(value: string) {
  return value.length > 0 ? null : "Enter your password.";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useStore((s) => s.setUser);
  const setLoadingUser = useStore((s) => s.setLoadingUser);

  const [studyId, setStudyId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showConsentDetails, setShowConsentDetails] = useState(false);
  const [touched, setTouched] = useState({ studyId: false, password: false, consent: false });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const studyIdError  = touched.studyId  ? validateStudyId(studyId)  : null;
  const passwordError = touched.password ? validatePassword(password) : null;
  const consentError  = touched.consent && !consentAccepted
    ? "Please accept the study consent to continue."
    : null;
  const isFormValid   =
    !validateStudyId(studyId) &&
    !validatePassword(password) &&
    consentAccepted;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ studyId: true, password: true, consent: true });
    if (!isFormValid) return;

    setSubmitting(true);
    setServerError(null);
    setLoadingUser(true);

    try {
      const user = await login(studyId, password);
      localStorage.setItem(`leeswijs-consent:${user.id}`, "true");
      localStorage.setItem(`leeswijs-consent-at:${user.id}`, new Date().toISOString());
      setUser(user);
      navigate(user.onboarding_completed ? "/home" : "/onboarding", { replace: true });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
      setLoadingUser(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-9"
    >
      <div className="mb-7">
        <h1 className="font-heading text-2xl font-bold text-text">Welcome to the reading study</h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Please enter your Study ID to begin or continue your session.
        </p>
      </div>

      {serverError && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3"
        >
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700 font-body">{serverError}</p>
        </motion.div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Study ID" error={studyIdError} htmlFor="login-study-id">
          <InputWrapper icon={<KeyRound size={16} />} hasError={!!studyIdError}>
            <input
              id="login-study-id"
              type="text"
              autoComplete="username"
              placeholder="KIM"
              value={studyId}
              onChange={(e) => setStudyId(e.target.value.trim().toUpperCase())}
              onBlur={() => setTouched((t) => ({ ...t, studyId: true }))}
              className="flex-1 bg-transparent text-sm font-body text-text placeholder:text-text/30 outline-none"
            />
          </InputWrapper>
        </Field>

        <Field label="Password" error={passwordError} htmlFor="login-password">
          <InputWrapper icon={<Lock size={16} />} hasError={!!passwordError}>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              className="flex-1 bg-transparent text-sm font-body text-text placeholder:text-text/30 outline-none"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="text-text/30 hover:text-text/60 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </InputWrapper>
        </Field>

        <div
          className={[
            "block rounded-xl border p-4 transition-colors",
            consentError
              ? "border-red-300 bg-red-50/40"
              : consentAccepted
                ? "border-primary/35 bg-primary/[0.04]"
                : "border-black/10 bg-black/[0.02] hover:border-black/20",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => {
                  setConsentAccepted(e.target.checked);
                  setTouched((t) => ({ ...t, consent: true }));
                }}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span className="font-heading text-sm font-semibold text-text">
                I have read and agree to the study consent
              </span>
            </label>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowConsentDetails(true);
              }}
              className="shrink-0 text-xs font-heading font-semibold text-primary hover:underline"
            >
              View details
            </button>
          </div>

          {consentError && (
            <span className="mt-3 flex items-center gap-1 text-xs font-body text-red-500">
              <AlertCircle size={11} />
              {consentError}
            </span>
          )}
        </div>

        <motion.button
          type="submit"
          disabled={submitting}
          whileTap={{ scale: submitting ? 1 : 0.97 }}
          className={[
            "mt-2 w-full flex items-center justify-center gap-2",
            "rounded-xl px-5 py-3 text-sm font-heading font-semibold text-white",
            "bg-primary transition-opacity",
            submitting ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
          ].join(" ")}
        >
          {submitting ? <Spinner /> : <>Continue<ArrowRight size={16} strokeWidth={2.5} /></>}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-xs text-text/30 font-body">
        Dutch reading study
      </p>

      <ConsentDetailsModal
        open={showConsentDetails}
        onClose={() => setShowConsentDetails(false)}
      />
    </motion.div>
  );
}

function Field({ label, error, htmlFor, children }: {
  label: string;
  error: string | null;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-body font-semibold text-text/60 uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-red-500 font-body flex items-center gap-1"
        >
          <AlertCircle size={11} />
          {error}
        </motion.p>
      )}
    </div>
  );
}

function InputWrapper({ icon, hasError, children }: {
  icon: React.ReactNode;
  hasError: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={[
      "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
      "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
      hasError ? "border-red-300 bg-red-50/40" : "border-black/12 bg-black/[0.02] hover:border-black/20",
    ].join(" ")}>
      <span className={hasError ? "text-red-400" : "text-text/30"}>{icon}</span>
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
