import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  User as UserIcon,
  Award,
  Sparkles,
  LogOut,
  Settings as SettingsIcon,
} from "lucide-react";

import { useStore } from "../store";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ProfilePage() {
  const navigate  = useNavigate();
  const user      = useStore((s) => s.user);
  const clearUser = useStore((s) => s.clearUser);

  if (!user) return null;

  function handleLogout() {
    clearUser();
    navigate("/login", { replace: true });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-xl mx-auto"
    >
      <div className="bg-white rounded-2xl shadow-xl shadow-black/8 px-8 py-9">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-7">
          <div>
            <h1 className="font-heading text-2xl font-bold text-text">Profile</h1>
            <p className="mt-1 text-sm text-text/50 font-body">
              A quick look at your account.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={() => navigate("/settings")}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/12 bg-white px-3 py-1.5 text-xs font-heading font-semibold text-text/70 hover:bg-black/[0.03] hover:border-black/20"
          >
            <SettingsIcon size={12} />
            Edit in Settings
          </motion.button>
        </div>

        {/* Info rows */}
        <div className="space-y-4 mb-2">
          <InfoRow icon={<UserIcon size={14} />} label="Username" value={user.name} />
          <InfoRow
            icon={<Award size={14} />}
            label="CEFR Level"
            value={user.cefrLevel ?? "—"}
          />

          <div className="flex items-start gap-3">
            <span className="text-text/40 mt-0.5">
              <Sparkles size={14} />
            </span>
            <span className="text-xs font-body font-semibold text-text/60 uppercase tracking-wide w-24 pt-0.5 shrink-0">
              Interests
            </span>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {user.interests.length === 0 ? (
                <span className="text-sm text-text/40 font-body">—</span>
              ) : (
                user.interests.map((i) => (
                  <span
                    key={i}
                    className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-body font-semibold"
                  >
                    {capitalize(i)}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <hr className="border-black/8 my-7" />

        {/* Logout */}
        <motion.button
          type="button"
          onClick={handleLogout}
          whileTap={{ scale: 0.97 }}
          className="w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-body font-semibold text-red-600 border border-red-200 bg-red-50/50 hover:bg-red-50 transition-colors"
        >
          <LogOut size={16} />
          Log out
        </motion.button>
      </div>
    </motion.div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-text/40">{icon}</span>
      <span className="text-xs font-body font-semibold text-text/60 uppercase tracking-wide w-24 shrink-0">
        {label}
      </span>
      <span className="text-sm font-body text-text">{value}</span>
    </div>
  );
}
