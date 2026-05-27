import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, KeyRound } from "lucide-react";
import { registerUser } from "../services/api";
import { useStore } from "../store";
import ConsentDetailsModal from "../components/ConsentDetailsModal";

function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? null
    : "Enter a valid email address.";
}

function validatePassword(value: string) {
  return value.length >= 6 ? null : "Password must be at least 6 characters.";
}

function validateConfirm(password: string, confirm: string) {
  return password === confirm ? null : "Passwords do not match.";
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setUser  = useStore((s) => s.setUser);

  const initialStudyCode = (searchParams.get("code") || "").trim().toUpperCase();
  const [email,    setEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [studyCode, setStudyCode] = useState(initialStudyCode);
  const [showPassword, setShowPassword] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showConsentDetails, setShowConsentDetails] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false, confirm: false, consent: false });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailError    = touched.email    ? validateEmail(email)                  : null;
  const passwordError = touched.password ? validatePassword(password)            : null;
  const confirmError  = touched.confirm  ? validateConfirm(password, confirm)    : null;
  const consentError  = touched.consent && !consentAccepted
    ? "Please accept the study data consent to create an account."
    : null;
  const isFormValid   =
    !validateEmail(email) &&
    !validatePassword(password) &&
    !validateConfirm(password, confirm) &&
    consentAccepted;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, password: true, confirm: true, consent: true });
    if (!isFormValid) return;

    setSubmitting(true);
    setServerError(null);

    try {
      const user = await registerUser(email, password, studyCode || undefined);
      localStorage.setItem(`leeswijs-consent:${user.id}`, "true");
      localStorage.setItem(`leeswijs-consent-at:${user.id}`, new Date().toISOString());
      setUser(user);
      // Always go to onboarding after registration
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
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
        <h1 className="font-heading text-2xl font-bold text-text">Create your account</h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Start your Dutch reading journey today.
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
        {/* Email */}
        <Field label="Email Address" error={emailError} htmlFor="register-email">
          <InputWrapper icon={<Mail size={16} />} hasError={!!emailError}>
            <input
              id="register-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              className="flex-1 bg-transparent text-sm font-body text-text placeholder:text-text/30 outline-none"
            />
          </InputWrapper>
        </Field>

        {/* Password */}
        <Field label="Password" error={passwordError} htmlFor="register-password">
          <InputWrapper icon={<Lock size={16} />} hasError={!!passwordError}>
            <input
              id="register-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Create a password"
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

        {/* Confirm Password */}
        <Field label="Confirm Password" error={confirmError} htmlFor="register-confirm">
          <InputWrapper icon={<Lock size={16} />} hasError={!!confirmError}>
            <input
              id="register-confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              className="flex-1 bg-transparent text-sm font-body text-text placeholder:text-text/30 outline-none"
            />
          </InputWrapper>
        </Field>

        <Field label="Study Code" error={null} htmlFor="register-study-code">
          <InputWrapper icon={<KeyRound size={16} />} hasError={false}>
            <input
              id="register-study-code"
              type="text"
              autoComplete="off"
              placeholder="LW-A07"
              value={studyCode}
              onChange={(e) => setStudyCode(e.target.value.trim().toUpperCase())}
              className="flex-1 bg-transparent text-sm font-body text-text placeholder:text-text/30 outline-none"
            />
          </InputWrapper>
          <p className="text-xs text-text/35 font-body">
            Use the code from your study link if you received one.
          </p>
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
                I agree to the study consent
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
              Read more
            </button>
          </div>

          {consentError && (
            <span className="mt-3 flex items-center gap-1 text-xs font-body text-red-500">
              <AlertCircle size={11} />
              {consentError}
            </span>
          )}
        </div>

        {/* Submit */}
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
          {submitting ? (
            <Spinner />
          ) : (
            <>
              Get started
              <ArrowRight size={16} strokeWidth={2.5} />
            </>
          )}
        </motion.button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-black/8" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-text/35 font-body">
            Already have an account?
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate("/login")}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-black/12 px-5 py-2.5 text-sm font-body font-semibold text-text/70 hover:bg-black/[0.03] hover:text-text transition-colors"
      >
        Log In
      </button>

      <p className="mt-6 text-center text-xs text-text/30 font-body">
        🇳🇱 Learning Dutch, one article at a time.
      </p>

      <ConsentDetailsModal
        open={showConsentDetails}
        onClose={() => setShowConsentDetails(false)}
      />
    </motion.div>
  );
}

// Sub-components

function Field({ label, error, htmlFor, children }: {
  label: string;
  error: string | null;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-body font-semibold text-text/60 uppercase tracking-wide"
      >
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
    <div
      className={[
        "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
        "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
        hasError
          ? "border-red-300 bg-red-50/40"
          : "border-black/12 bg-black/[0.02] hover:border-black/20",
      ].join(" ")}
    >
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
