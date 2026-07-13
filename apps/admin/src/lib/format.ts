const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  dateStyle: "short",
  timeStyle: "short",
});
const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  timeStyle: "short",
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFmt.format(new Date(value));
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return timeFmt.format(new Date(value));
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} dk`;
  return `${h} sa ${m} dk`;
}

export function currentMonth(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" })
    .format(new Date())
    .slice(0, 7);
}

export function todayStr(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(new Date());
}

export const WEEKDAY_LABELS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
