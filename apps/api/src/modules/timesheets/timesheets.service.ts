import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";

import { TimesheetStatus, UserRole } from "@quanta/shared";

import { AttendanceRecord, Timesheet, User, UserShift } from "../../entities";
import { AuditService } from "../audit/audit.service";
import { toIstanbul } from "../attendance/shift-matching.util";
import { calculateMonth, type CalcAssignment } from "./timesheet-calculator";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** UTC range covering an Istanbul calendar month. */
export function monthUtcRange(periodMonth: string): { start: Date; end: Date } {
  const [year, month] = periodMonth.split("-").map((p) => parseInt(p, 10));
  const start = new Date(`${periodMonth}-01T00:00:00+03:00`);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const end = new Date(`${nextMonth}-01T00:00:00+03:00`);
  return { start, end };
}

@Injectable()
export class TimesheetsService {
  private readonly logger = new Logger(TimesheetsService.name);

  constructor(
    @InjectRepository(Timesheet) private readonly timesheets: Repository<Timesheet>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AttendanceRecord) private readonly records: Repository<AttendanceRecord>,
    @InjectRepository(UserShift) private readonly userShifts: Repository<UserShift>,
    private readonly audit: AuditService,
  ) {}

  /** Nightly recalculation of the current month (spec: @nestjs/schedule cron). */
  @Cron("30 2 * * *", { timeZone: "Europe/Istanbul" })
  async nightlyGenerate(): Promise<void> {
    const month = toIstanbul(new Date()).dateStr.slice(0, 7);
    this.logger.log(`Nightly timesheet generation for ${month}`);
    await this.generateForMonth(month);
  }

  /** (Re)calculates DRAFT timesheets for every active employee. */
  async generateForMonth(periodMonth: string): Promise<{ generated: number; skippedApproved: number }> {
    if (!MONTH_RE.test(periodMonth)) throw new BadRequestException("Ay formatı YYYY-AA olmalıdır.");
    const { start, end } = monthUtcRange(periodMonth);
    const employees = await this.users.findBy({ isActive: true, role: UserRole.EMPLOYEE });

    let generated = 0;
    let skippedApproved = 0;
    for (const employee of employees) {
      const existing = await this.timesheets.findOneBy({
        userId: employee.id,
        periodMonth,
      });
      if (existing?.status === TimesheetStatus.APPROVED) {
        skippedApproved++;
        continue;
      }

      const [monthRecords, assignments] = await Promise.all([
        this.records.find({
          where: { userId: employee.id, timestamp: Between(start, end) },
          order: { timestamp: "ASC" },
        }),
        this.userShifts.find({ where: { userId: employee.id }, relations: { shift: true } }),
      ]);

      const totals = calculateMonth(
        periodMonth,
        monthRecords.map((r) => ({
          type: r.type,
          timestamp: r.timestamp,
          lateMinutes: r.lateMinutes,
        })),
        assignments
          .filter((a) => a.shift)
          .map(
            (a): CalcAssignment => ({
              shift: a.shift,
              effectiveFrom: a.effectiveFrom,
              effectiveTo: a.effectiveTo,
            }),
          ),
      );

      await this.timesheets.save(
        this.timesheets.create({
          ...(existing ? { id: existing.id } : {}),
          userId: employee.id,
          periodMonth,
          ...totals,
          status: TimesheetStatus.DRAFT,
        }),
      );
      generated++;
    }
    return { generated, skippedApproved };
  }

  async findForMonth(periodMonth: string) {
    if (!MONTH_RE.test(periodMonth)) throw new BadRequestException("Ay formatı YYYY-AA olmalıdır.");
    const sheets = await this.timesheets.find({
      where: { periodMonth },
      relations: { user: true },
      order: { updatedAt: "DESC" },
    });
    return sheets.map((t) => ({
      id: t.id,
      userId: t.userId,
      fullName: t.user?.fullName,
      employeeCode: t.user?.employeeCode,
      department: t.user?.department,
      periodMonth: t.periodMonth,
      totalWorkedMinutes: t.totalWorkedMinutes,
      totalLateMinutes: t.totalLateMinutes,
      totalOvertimeMinutes: t.totalOvertimeMinutes,
      absentDays: t.absentDays,
      status: t.status,
      approvedBy: t.approvedBy,
      updatedAt: t.updatedAt,
    }));
  }

  async findMineForMonth(userId: string, periodMonth: string) {
    if (!MONTH_RE.test(periodMonth)) throw new BadRequestException("Ay formatı YYYY-AA olmalıdır.");
    return this.timesheets.findOneBy({ userId, periodMonth });
  }

  async approve(id: string, adminId: string): Promise<Timesheet> {
    const sheet = await this.timesheets.findOneBy({ id });
    if (!sheet) throw new NotFoundException("Puantaj kaydı bulunamadı.");
    if (sheet.status === TimesheetStatus.APPROVED) {
      throw new BadRequestException("Bu puantaj zaten onaylanmış.");
    }
    sheet.status = TimesheetStatus.APPROVED;
    sheet.approvedBy = adminId;
    const saved = await this.timesheets.save(sheet);
    await this.audit.log({
      userId: adminId,
      action: "TIMESHEET_APPROVED",
      detail: { timesheetId: id, periodMonth: sheet.periodMonth, targetUserId: sheet.userId },
    });
    return saved;
  }
}
