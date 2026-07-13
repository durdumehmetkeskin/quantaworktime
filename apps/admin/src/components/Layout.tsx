import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../lib/auth";

const NAV_ITEMS = [
  { to: "/", label: "Panel", exact: true },
  { to: "/employees", label: "Çalışanlar" },
  { to: "/tablets", label: "Tabletler" },
  { to: "/timesheets", label: "Puantaj" },
  { to: "/records", label: "Kayıtlar" },
];

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col bg-slate-900 text-slate-200">
        <div className="flex items-center gap-3 px-5 py-6">
          {/* navy single-color logo → render white on the dark sidebar */}
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
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
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
        <div className="border-t border-slate-800 px-5 py-4">
          <div className="truncate text-sm font-medium text-white">{user?.fullName}</div>
          <div className="truncate text-xs text-slate-400">{user?.email}</div>
          <button className="mt-2 text-xs text-slate-400 underline hover:text-white" onClick={logout}>
            Çıkış yap
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
