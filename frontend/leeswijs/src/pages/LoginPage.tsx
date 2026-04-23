import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User as UserIcon, Lock, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import { login } from "../services/api";
import { useStore } from "../store";

// Validation
function validateUsername(value: string) {
  return value.trim().length >= 3
    ? null
    : "Username must be at least 3 characters.";
}

function validatePassword(value: string) {
  return value.length >= 4 ? null : "Password must be at least 4 characters.";
}

// Component
export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useStore((s) => s.setUser);
  const setLoadingUser = useStore((s) => s.setLoadingUser);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const usernameError = touched.username ? validateUsername(username) : null;
  const passwordError = touched.password ? validatePassword(password) : null;
  const isFormValid = !validateUsername(username) && !validatePassword(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ username: true, password: true });
    if (!isFormValid) return;

    setSubmitting(true);
    setServerError(null);
    setLoadingUser(true);

    try {
      const user = await login(username, password);
      setUser(user);
      // Route new participants through the interest + placement flow before
      // the main app. Returning users (interests already set) skip straight
      // to /home.
      const isNewUser = user.interests.length === 0;
      navigate(isNewUser ? "/onboarding" : "/home", { replace: true });
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
      {/* Heading */}
      <div className="mb-7">
        <h1 className="font-heading text-2xl font-bold text-text">Welcome back</h1>
        <p className="mt-1 text-sm text-text/50 font-body">
          Log in to continue your Dutch journey.
        </p>
      </div>

      {/* Server error banner */}
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
        {/* Username */}
        <Field
          label="Username"
          error={usernameError}
          htmlFor="login-username"
        >
          <InputWrapper icon={<UserIcon size={16} />} hasError={!!usernameError}>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              placeholder="e.g. user01"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, username: true }))}
              className="flex-1 bg-transparent text-sm font-body text-text placeholder:text-text/30 outline-none"
            />
          </InputWrapper>
        </Field>

        {/* Password */}
        <Field
          label="Password"
          error={passwordError}
          htmlFor="login-password"
        >
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
              Log In
              <ArrowRight size={16} strokeWidth={2.5} />
            </>
          )}
        </motion.button>
      </form>

      {/* Credentials hint */}
      <div className="mt-6 rounded-xl border border-black/8 bg-black/[0.02] px-4 py-3">
        <p className="text-xs text-text/60 font-body leading-relaxed">
          Your username and password are provided by the research team.
          Please contact us if you don't have yours yet.
        </p>
      </div>

      {/* Language flag accent */}
      <p className="mt-5 text-center text-xs text-text/30 font-body">
        🇳🇱 Learning Dutch, one article at a time.
      </p>
    </motion.div>
  );
}

// Sub-components
function Field({
  label,
  error,
  htmlFor,
  children,
}: {
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

function InputWrapper({
  icon,
  hasError,
  children,
}: {
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
    <svg
      className="animate-spin h-4 w-4 text-white"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
