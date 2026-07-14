import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {action}
        </div>
      )}
      {/* Tables and other wide content scroll horizontally on small screens. */}
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
  ghost: "text-indigo-600 hover:bg-indigo-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "slate" | "indigo"; children: ReactNode }) {
  const tones = {
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-rose-100 text-rose-700",
    slate: "bg-slate-100 text-slate-600",
    indigo: "bg-indigo-100 text-indigo-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function Spinner() {
  return <div className="py-8 text-center text-sm text-slate-500">Yükleniyor…</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-8 text-center text-sm text-slate-400">{message}</div>;
}
