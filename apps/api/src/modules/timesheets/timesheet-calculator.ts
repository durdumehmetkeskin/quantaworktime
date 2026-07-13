import { AttendanceType } from "@quanta/shared";

import {
  isWorkDay,
  parseTimeToMinutes,
  scheduledMinutes,
  toIstanbul,
  type ShiftLike,
} from "../attendance/shift-matching.util";

export interface CalcRecord {
  type: AttendanceType;
  /** UTC. */
  timestamp: Date;
  lateMinutes: number;
}

export interface CalcAssignment {
  shift: ShiftLike;
  effectiveFrom: string; // "YYYY-MM-DD"
  effectiveTo: string | null;
}

export interface CalcLeave {
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM"; null together with endTime = full-day leave. */
  startTime: string | null;
  endTime: string | null;
}

export interface ExtraDay {
  /** Istanbul calendar day, "YYYY-MM-DD". */
  date: string;
  /** Minutes worked beyond schedule (or the whole day's work on an off day). */
  minutes: number;
}

export interface MonthTotals {
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  /** Leave (izin) minutes — counted separately, never as missing time. */
  totalLeaveMinutes: number;
  absentDays: number;
  /**
   * Out-of-schedule work per day. NOT automatically overtime: an admin must
   * classify each day as OVERTIME or MAKEUP (eksik mesai tamamlama);
   * only approved OVERTIME flows into the timesheet's overtime total.
   */
  extraDays: ExtraDay[];
}

/** The shift assignment effective on a given local date, if any. */
export function shiftForDate(assignments: CalcAssignment[], dateStr: string): ShiftLike | null {
  const match = assignments
    .filter((a) => a.effectiveFrom <= dateStr && (!a.effectiveTo || a.effectiveTo >= dateStr))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  return match?.shift ?? null;
}

/**
 * Worked minutes for one day: the SUM of matched IN→OUT pairs, so time spent
 * outside (multiple entries/exits in a day) is never counted as work.
 * Pairing walks the records chronologically: an IN opens a pair, the next OUT
 * closes it; duplicate INs and unmatched OUTs are ignored, and a trailing
 * unclosed IN contributes nothing (completed pairs still count).
 *
 * Break rule: with a single pair the break is assumed taken inside and
 * `breakMinutes` is deducted; with multiple pairs the break already shows up
 * as an uncounted gap, so nothing is deducted.
 */
export function workedMinutesForDay(dayRecords: CalcRecord[], shift: ShiftLike | null): number {
  const sorted = [...dayRecords].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let openIn: number | null = null;
  let total = 0;
  let pairs = 0;
  for (const record of sorted) {
    if (record.type === AttendanceType.IN) {
      if (openIn === null) openIn = record.timestamp.getTime();
    } else if (openIn !== null) {
      total += Math.floor((record.timestamp.getTime() - openIn) / 60_000);
      openIn = null;
      pairs++;
    }
  }
  if (pairs === 0) return 0;
  if (pairs === 1) return Math.max(0, total - (shift?.breakMinutes ?? 0));
  return total;
}

/**
 * Monthly totals for one user, computed over Europe/Istanbul calendar days.
 * Days after `today` (or the month end) are not evaluated. A scheduled work
 * day with no records at all counts as absent.
 */
export function calculateMonth(
  periodMonth: string, // "YYYY-MM"
  records: CalcRecord[],
  assignments: CalcAssignment[],
  today: Date = new Date(),
  leaves: CalcLeave[] = [],
): MonthTotals {
  const [year, month] = periodMonth.split("-").map((p) => parseInt(p, 10));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const todayLocal = toIstanbul(today).dateStr;

  // Bucket records by local calendar day.
  const byDay = new Map<string, CalcRecord[]>();
  for (const record of records) {
    const key = toIstanbul(record.timestamp).dateStr;
    const bucket = byDay.get(key) ?? [];
    bucket.push(record);
    byDay.set(key, bucket);
  }
  const leavesByDay = new Map<string, CalcLeave[]>();
  for (const leave of leaves) {
    const bucket = leavesByDay.get(leave.date) ?? [];
    bucket.push(leave);
    leavesByDay.set(leave.date, bucket);
  }

  const totals: MonthTotals = {
    totalWorkedMinutes: 0,
    totalLateMinutes: 0,
    totalLeaveMinutes: 0,
    absentDays: 0,
    extraDays: [],
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${periodMonth}-${String(day).padStart(2, "0")}`;
    if (dateStr > todayLocal) break; // future days are not evaluated

    const shift = shiftForDate(assignments, dateStr);
    const dayRecords = byDay.get(dateStr) ?? [];
    const dayLeaves = leavesByDay.get(dateStr) ?? [];
    // weekday of dateStr: construct noon UTC to avoid boundary issues
    const weekday = (new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7;
    const scheduled = shift && isWorkDay(shift, weekday) ? scheduledMinutes(shift) : 0;

    // Leave minutes inside the day's schedule (full day = whole schedule).
    const leaveMinutes = scheduled > 0 ? leaveMinutesForDay(dayLeaves, shift!, scheduled) : 0;
    totals.totalLeaveMinutes += leaveMinutes;

    const worked = workedMinutesForDay(dayRecords, shift);
    totals.totalWorkedMinutes += worked;

    // Late minutes overlapped by a leave window are forgiven.
    const storedLate = dayRecords
      .filter((r) => r.type === AttendanceType.IN)
      .reduce((sum, r) => sum + r.lateMinutes, 0);
    totals.totalLateMinutes += forgiveLate(storedLate, dayLeaves, shift);

    if (scheduled > 0) {
      if (dayRecords.length === 0) {
        // A day fully covered by leave is not an absence.
        if (leaveMinutes < scheduled) totals.absentDays += 1;
      } else if (worked > scheduled - leaveMinutes) {
        // Extra work is measured against the schedule REDUCED by leave.
        totals.extraDays.push({ date: dateStr, minutes: worked - (scheduled - leaveMinutes) });
      }
    } else if (worked > 0) {
      // Work on a non-scheduled day is entirely out-of-schedule.
      totals.extraDays.push({ date: dateStr, minutes: worked });
    }
  }

  return totals;
}

/** Overlap of the leave windows with the day's shift window, in minutes. */
function leaveMinutesForDay(dayLeaves: CalcLeave[], shift: ShiftLike, scheduled: number): number {
  let total = 0;
  const shiftStart = parseTimeToMinutes(shift.startTime);
  let shiftEnd = parseTimeToMinutes(shift.endTime);
  if (shiftEnd <= shiftStart) shiftEnd += 1440; // overnight
  for (const leave of dayLeaves) {
    if (!leave.startTime || !leave.endTime) {
      return scheduled; // full-day leave covers the entire schedule
    }
    let ls = parseTimeToMinutes(leave.startTime);
    let le = parseTimeToMinutes(leave.endTime);
    if (shiftEnd > 1440 && ls < shiftStart) {
      ls += 1440;
      le += 1440;
    }
    total += Math.max(0, Math.min(le, shiftEnd) - Math.max(ls, shiftStart));
  }
  return Math.min(total, scheduled);
}

/** Late minutes not covered by any leave window at the start of the shift. */
function forgiveLate(storedLate: number, dayLeaves: CalcLeave[], shift: ShiftLike | null): number {
  if (storedLate === 0 || !shift || dayLeaves.length === 0) return storedLate;
  if (dayLeaves.some((l) => !l.startTime || !l.endTime)) return 0; // full-day leave
  const shiftStart = parseTimeToMinutes(shift.startTime);
  // The late interval is [shiftStart, shiftStart + grace + late]; a leave
  // overlapping it excuses that overlap.
  const lateEnd = shiftStart + shift.graceMinutes + storedLate;
  let forgiven = 0;
  for (const leave of dayLeaves) {
    const ls = parseTimeToMinutes(leave.startTime!);
    const le = parseTimeToMinutes(leave.endTime!);
    forgiven += Math.max(0, Math.min(le, lateEnd) - Math.max(ls, shiftStart));
  }
  return Math.max(0, storedLate - forgiven);
}
