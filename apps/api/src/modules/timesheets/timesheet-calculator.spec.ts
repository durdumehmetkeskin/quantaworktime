import { AttendanceType } from "@quanta/shared";

import type { ShiftLike } from "../attendance/shift-matching.util";
import {
  calculateMonth,
  shiftForDate,
  workedMinutesForDay,
  type CalcAssignment,
  type CalcRecord,
} from "./timesheet-calculator";

const DAY_SHIFT: ShiftLike = {
  startTime: "09:00",
  endTime: "18:00",
  graceMinutes: 10,
  workDays: 0b0011111, // Mon-Fri
  breakMinutes: 60,
};

const NIGHT_SHIFT: ShiftLike = {
  startTime: "22:00",
  endTime: "06:00",
  graceMinutes: 5,
  workDays: 0b0011111,
  breakMinutes: 30,
};

const assignment = (shift: ShiftLike): CalcAssignment[] => [
  { shift, effectiveFrom: "2026-01-01", effectiveTo: null },
];

/** UTC instant for an Istanbul wall-clock time (Istanbul = UTC+3). */
function ist(dateStr: string, hhmm: string): Date {
  return new Date(`${dateStr}T${hhmm}:00+03:00`);
}

function rec(type: AttendanceType, at: Date, lateMinutes = 0): CalcRecord {
  return { type, timestamp: at, lateMinutes };
}

describe("timesheet-calculator", () => {
  describe("workedMinutesForDay", () => {
    it("computes first IN → last OUT minus break", () => {
      const records = [
        rec(AttendanceType.IN, ist("2026-06-01", "09:00")),
        rec(AttendanceType.OUT, ist("2026-06-01", "18:00")),
      ];
      expect(workedMinutesForDay(records, DAY_SHIFT)).toBe(9 * 60 - 60);
    });

    it("returns 0 when the day has only an IN", () => {
      expect(
        workedMinutesForDay([rec(AttendanceType.IN, ist("2026-06-01", "09:00"))], DAY_SHIFT),
      ).toBe(0);
    });

    it("never goes negative when OUT precedes IN", () => {
      const records = [
        rec(AttendanceType.IN, ist("2026-06-01", "18:00")),
        rec(AttendanceType.OUT, ist("2026-06-01", "09:00")),
      ];
      expect(workedMinutesForDay(records, DAY_SHIFT)).toBe(0);
    });
  });

  describe("shiftForDate", () => {
    it("respects effectiveFrom/effectiveTo windows and picks the latest", () => {
      const assignments: CalcAssignment[] = [
        { shift: DAY_SHIFT, effectiveFrom: "2026-01-01", effectiveTo: "2026-05-31" },
        { shift: NIGHT_SHIFT, effectiveFrom: "2026-06-01", effectiveTo: null },
      ];
      expect(shiftForDate(assignments, "2026-05-15")).toBe(DAY_SHIFT);
      expect(shiftForDate(assignments, "2026-06-15")).toBe(NIGHT_SHIFT);
      expect(shiftForDate(assignments, "2025-12-31")).toBeNull();
    });
  });

  describe("calculateMonth", () => {
    // June 2026: 1st is a Monday, 30 days → 22 weekdays.
    const today = ist("2026-07-01", "12:00");

    it("computes a clean full month", () => {
      const records: CalcRecord[] = [];
      for (let day = 1; day <= 30; day++) {
        const d = `2026-06-${String(day).padStart(2, "0")}`;
        const weekday = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
        if (weekday >= 5) continue; // weekend
        records.push(rec(AttendanceType.IN, ist(d, "09:00")));
        records.push(rec(AttendanceType.OUT, ist(d, "18:00")));
      }
      const totals = calculateMonth("2026-06", records, assignment(DAY_SHIFT), today);
      expect(totals.totalWorkedMinutes).toBe(22 * 480);
      expect(totals.absentDays).toBe(0);
      expect(totals.totalLateMinutes).toBe(0);
      expect(totals.totalOvertimeMinutes).toBe(0);
    });

    it("counts absences on scheduled days without records", () => {
      // only one day worked
      const records = [
        rec(AttendanceType.IN, ist("2026-06-01", "09:00")),
        rec(AttendanceType.OUT, ist("2026-06-01", "18:00")),
      ];
      const totals = calculateMonth("2026-06", records, assignment(DAY_SHIFT), today);
      expect(totals.absentDays).toBe(21);
    });

    it("sums stored lateMinutes and computes overtime", () => {
      const records = [
        rec(AttendanceType.IN, ist("2026-06-01", "09:25"), 15),
        rec(AttendanceType.OUT, ist("2026-06-01", "20:25")), // 11h gross - 1h break = 600 min
      ];
      const totals = calculateMonth("2026-06", records, assignment(DAY_SHIFT), today);
      expect(totals.totalLateMinutes).toBe(15);
      expect(totals.totalOvertimeMinutes).toBe(600 - 480);
    });

    it("treats work on a weekend (non-scheduled day) entirely as overtime", () => {
      const records = [
        rec(AttendanceType.IN, ist("2026-06-06", "10:00")), // Saturday
        rec(AttendanceType.OUT, ist("2026-06-06", "14:00")),
      ];
      const totals = calculateMonth("2026-06", records, assignment(DAY_SHIFT), today);
      expect(totals.totalOvertimeMinutes).toBe(4 * 60 - 60);
    });

    it("does not evaluate days after 'today' (no phantom absences)", () => {
      const midMonth = ist("2026-06-10", "23:00"); // Wednesday evening
      const records = [
        rec(AttendanceType.IN, ist("2026-06-01", "09:00")),
        rec(AttendanceType.OUT, ist("2026-06-01", "18:00")),
      ];
      const totals = calculateMonth("2026-06", records, assignment(DAY_SHIFT), midMonth);
      // scheduled weekdays up to Jun 10: 1..5 and 8..10 → 8 days, 1 worked
      expect(totals.absentDays).toBe(7);
    });

    it("buckets an overnight shift's post-midnight OUT to the next local day", () => {
      // Night shift Mon 22:00 → Tue 05:30. The OUT lands on Tuesday's bucket;
      // Monday counts worked 0 (incomplete pair) — a documented simplification.
      const records = [
        rec(AttendanceType.IN, ist("2026-06-01", "22:00")),
        rec(AttendanceType.OUT, ist("2026-06-02", "05:30")),
      ];
      const totals = calculateMonth("2026-06", records, assignment(NIGHT_SHIFT), today);
      // Neither day pairs IN+OUT, so no worked minutes, but both days have
      // records so they are not absent.
      expect(totals.totalWorkedMinutes).toBe(0);
      expect(totals.absentDays).toBeLessThanOrEqual(20);
    });
  });
});
