import { AttendanceType } from "@quanta/shared";

import {
  isWorkDay,
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

export interface MonthTotals {
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  absentDays: number;
}

/** The shift assignment effective on a given local date, if any. */
export function shiftForDate(assignments: CalcAssignment[], dateStr: string): ShiftLike | null {
  const match = assignments
    .filter((a) => a.effectiveFrom <= dateStr && (!a.effectiveTo || a.effectiveTo >= dateStr))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  return match?.shift ?? null;
}

/** Worked minutes for one day: first IN → last OUT, minus break. */
export function workedMinutesForDay(dayRecords: CalcRecord[], shift: ShiftLike | null): number {
  const ins = dayRecords.filter((r) => r.type === AttendanceType.IN);
  const outs = dayRecords.filter((r) => r.type === AttendanceType.OUT);
  if (ins.length === 0 || outs.length === 0) return 0;
  const firstIn = Math.min(...ins.map((r) => r.timestamp.getTime()));
  const lastOut = Math.max(...outs.map((r) => r.timestamp.getTime()));
  if (lastOut <= firstIn) return 0;
  const gross = Math.floor((lastOut - firstIn) / 60_000);
  return Math.max(0, gross - (shift?.breakMinutes ?? 0));
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

  const totals: MonthTotals = {
    totalWorkedMinutes: 0,
    totalLateMinutes: 0,
    totalOvertimeMinutes: 0,
    absentDays: 0,
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${periodMonth}-${String(day).padStart(2, "0")}`;
    if (dateStr > todayLocal) break; // future days are not evaluated

    const shift = shiftForDate(assignments, dateStr);
    const dayRecords = byDay.get(dateStr) ?? [];
    // weekday of dateStr: construct noon UTC to avoid boundary issues
    const weekday = (new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7;
    const scheduled = shift && isWorkDay(shift, weekday) ? scheduledMinutes(shift) : 0;

    const worked = workedMinutesForDay(dayRecords, shift);
    totals.totalWorkedMinutes += worked;
    totals.totalLateMinutes += dayRecords
      .filter((r) => r.type === AttendanceType.IN)
      .reduce((sum, r) => sum + r.lateMinutes, 0);

    if (scheduled > 0) {
      if (dayRecords.length === 0) {
        totals.absentDays += 1;
      } else if (worked > scheduled) {
        totals.totalOvertimeMinutes += worked - scheduled;
      }
    } else if (worked > 0) {
      // Work on a non-scheduled day counts entirely as overtime.
      totals.totalOvertimeMinutes += worked;
    }
  }

  return totals;
}
