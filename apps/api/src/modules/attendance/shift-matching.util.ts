import { ISTANBUL_UTC_OFFSET_MINUTES } from "@quanta/shared";

/**
 * Pure shift-time math. All wall-clock comparisons happen in Europe/Istanbul,
 * which has been fixed at UTC+3 (no DST) since 2016 — a constant offset is
 * used deliberately instead of a timezone library.
 */
export interface ShiftLike {
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
  graceMinutes: number;
  workDays: number; // bitmask, bit 0 = Monday ... bit 6 = Sunday
  breakMinutes: number;
}

export interface IstanbulInstant {
  /** "YYYY-MM-DD" local date. */
  dateStr: string;
  /** 0 = Monday ... 6 = Sunday. */
  weekday: number;
  /** Minutes since local midnight. */
  minutesOfDay: number;
}

export function toIstanbul(utc: Date): IstanbulInstant {
  const shifted = new Date(utc.getTime() + ISTANBUL_UTC_OFFSET_MINUTES * 60_000);
  // getUTC* on the shifted date now reads Istanbul wall-clock values.
  const weekday = (shifted.getUTCDay() + 6) % 7; // JS Sunday=0 → our Monday=0
  const dateStr = shifted.toISOString().slice(0, 10);
  const minutesOfDay = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { dateStr, weekday, minutesOfDay };
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((p) => parseInt(p, 10));
  return h * 60 + m;
}

export function isWorkDay(shift: ShiftLike, weekday: number): boolean {
  return (shift.workDays & (1 << weekday)) !== 0;
}

/** Minutes of lateness for an IN record; 0 when on time, off-day or within grace. */
export function computeLateMinutes(shift: ShiftLike, at: IstanbulInstant): number {
  if (!isWorkDay(shift, at.weekday)) return 0;
  const startMin = parseTimeToMinutes(shift.startTime);
  const late = at.minutesOfDay - (startMin + shift.graceMinutes);
  return Math.max(0, late);
}

/** Minutes of early leave for an OUT record; supports overnight shifts. */
export function computeEarlyLeaveMinutes(shift: ShiftLike, at: IstanbulInstant): number {
  const startMin = parseTimeToMinutes(shift.startTime);
  let endMin = parseTimeToMinutes(shift.endTime);
  let outMin = at.minutesOfDay;
  const overnight = endMin <= startMin;
  if (overnight) {
    endMin += 1440;
    // An OUT after midnight belongs to the previous day's shift window.
    if (outMin < startMin) outMin += 1440;
    if (!isWorkDay(shift, at.weekday) && !isWorkDay(shift, (at.weekday + 6) % 7)) return 0;
  } else if (!isWorkDay(shift, at.weekday)) {
    return 0;
  }
  return Math.max(0, endMin - outMin);
}

/** Scheduled net working minutes for one day of this shift. */
export function scheduledMinutes(shift: ShiftLike): number {
  const startMin = parseTimeToMinutes(shift.startTime);
  let endMin = parseTimeToMinutes(shift.endTime);
  if (endMin <= startMin) endMin += 1440;
  return Math.max(0, endMin - startMin - shift.breakMinutes);
}
