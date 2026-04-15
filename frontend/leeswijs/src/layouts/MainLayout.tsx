import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Home, BookOpen, Layers, User, Menu, X } from "lucide-react";

const NAV_ITEMS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/read", label: "Read", icon: BookOpen },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/profile", label: "Profile", icon: User },
] as const;

// Placeholder — replace with real user from store once auth is wired up
const MOCK_USER = { name: "Learner", cefrLevel: "B1" };

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Mobile overlay ───────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={[
          "fixed top-0 left-0 h-full w-56 bg-white border-r border-black/8 z-30",
          "flex flex-col py-6 px-3 gap-1",
          "transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0 lg:static lg:z-auto",
        ].join(" ")}
      >
        {/* Wordmark */}
        <div className="px-3 mb-6">
          <span className="font-heading text-2xl font-bold text-primary">Lees</span>
          <span className="font-heading text-2xl font-bold text-secondary">Wijs</span>
        </div>

        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-body font-semibold transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-text/60 hover:bg-black/5 hover:text-text",
              ].join(" ")
            }
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </aside>

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-black/8 flex items-center justify-between px-4 lg:px-6 shrink-0">
          {/* Hamburger (mobile only) */}
          <button
            className="lg:hidden p-1.5 rounded-lg text-text/60 hover:bg-black/5"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="hidden lg:block" />

          {/* User info */}
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-heading font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "var(--color-secondary)", color: "#fff" }}
            >
              {MOCK_USER.cefrLevel}
            </span>
            <span className="text-sm font-body text-text/80">{MOCK_USER.name}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
