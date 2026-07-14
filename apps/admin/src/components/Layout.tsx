import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../lib/auth";

const NAV_ITEMS = [
  { to: "/", label: "Panel", exact: true },
  { to: "/employees", label: "Çalışanlar" },
  { to: "/shifts", label: "Vardiyalar" },
  { to: "/tablets", label: "Tabletler" },
  { to: "/timesheets", label: "Puantaj" },
  { to: "/records", label: "Kayıtlar" },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      {/* navy single-color logo → render white on the dark background */}
      <img
        src="/logo.png"
        alt="Quanta"
        className="h-10 w-10"
        style={{ filter: "brightness(0) invert(1)" }}
      />
      <div>
        <div className="text-lg font-bold text-white">Quanta</div>
        <div className="text-xs text-slate-400">Mesai Yönetimi</div>
      </div>
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 px-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          onClick={onNavigate}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-slate-800"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 md:hidden">
        <Logo />
        <button
          className="rounded-lg p-2 text-slate-200 hover:bg-slate-800"
          aria-label="Menü"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </header>
      {/* Mobile slide-down menu */}
      {menuOpen && (
        <div className="bg-slate-900 pb-4 md:hidden">
          {nav(() => setMenuOpen(false))}
          <div className="mt-3 border-t border-slate-800 px-5 pt-3">
            <div className="truncate text-sm font-medium text-white">{user?.fullName}</div>
            <button className="mt-1 text-xs text-slate-400 underline hover:text-white" onClick={logout}>
              Çıkış yap
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-56 flex-col bg-slate-900 text-slate-200 md:flex">
        <div className="px-5 py-6">
          <Logo />
        </div>
        {nav()}
        <div className="border-t border-slate-800 px-5 py-4">
          <div className="truncate text-sm font-medium text-white">{user?.fullName}</div>
          <div className="truncate text-xs text-slate-400">{user?.email}</div>
          <button className="mt-2 text-xs text-slate-400 underline hover:text-white" onClick={logout}>
            Çıkış yap
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
