import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";

import { ExtraWorkStatus, TimesheetStatus, UserRole } from "@quanta/shared";

import { AttendanceRecord, ExtraWorkEntry, LeaveEntry, Timesheet, User, UserShift } from "../../entities";
import { AuditService } from "../audit/audit.service";
import { toIstanbul } from "../attendance/shift-matching.util";
import { calculateMonth, type CalcAssignment, type CalcLeave } from "./timesheet-calculator";

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
    @InjectRepository(ExtraWorkEntry) private readonly extraWork: Repository<ExtraWorkEntry>,
    @InjectRepository(LeaveEntry) private readonly leaves: Repository<LeaveEntry>,
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

      const [monthRecords, assignments, monthLeaves] = await Promise.all([
        this.records.find({
          where: { userId: employee.id, timestamp: Between(start, end) },
          order: { timestamp: "ASC" },
        }),
        this.userShifts.find({ where: { userId: employee.id }, relations: { shift: true } }),
        this.monthLeaves(employee.id, periodMonth),
      ]);

      const { extraDays, ...totals } = calculateMonth(
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
        new Date(),
        monthLeaves.map(
          (l): CalcLeave => ({
            date: l.leaveDate,
            startTime: l.startTime ? l.startTime.slice(0, 5) : null,
            endTime: l.endTime ? l.endTime.slice(0, 5) : null,
          }),
        ),
      );

      // Sync out-of-schedule work entries for this month: refresh minutes,
      // preserve an existing admin decision, drop days that no longer apply.
      const monthEntries = await this.monthEntries(employee.id, periodMonth);
      const byDate = new Map(monthEntries.map((e) => [e.workDate, e]));
      for (const extra of extraDays) {
        const entry = byDate.get(extra.date);
        if (entry) {
          if (entry.minutes !== extra.minutes) {
            entry.minutes = extra.minutes;
            await this.extraWork.save(entry);
          }
          byDate.delete(extra.date);
        } else {
          await this.extraWork.save(
            this.extraWork.create({
              userId: employee.id,
              workDate: extra.date,
              minutes: extra.minutes,
              status: ExtraWorkStatus.PENDING,
            }),
          );
        }
      }
      for (const stale of byDate.values()) {
        await this.extraWork.delete(stale.id);
      }

      // Overtime counts ONLY admin-approved OVERTIME entries; MAKEUP minutes
      // stay inside totalWorkedMinutes and offset missing hours naturally.
      const approvedOvertime = (await this.monthEntries(employee.id, periodMonth))
        .filter((e) => e.status === ExtraWorkStatus.OVERTIME)
        .reduce((sum, e) => sum + e.minutes, 0);

      await this.timesheets.save(
        this.timesheets.create({
          ...(existing ? { id: existing.id } : {}),
          userId: employee.id,
          periodMonth,
          ...totals,
          totalOvertimeMinutes: approvedOvertime,
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
      totalLeaveMinutes: t.totalLeaveMinutes,
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

  private monthLeaves(userId: string, periodMonth: string): Promise<LeaveEntry[]> {
    return this.leaves
      .createQueryBuilder("l")
      .where("l.userId = :userId", { userId })
      .andWhere('l."leaveDate"::text LIKE :prefix', { prefix: `${periodMonth}-%` })
      .getMany();
  }

  /** Guard shared by leave mutations: an APPROVED month is immutable. */
  private async assertMonthNotApproved(userId: string, periodMonth: string): Promise<void> {
    const sheet = await this.timesheets.findOneBy({ userId, periodMonth });
    if (sheet?.status === TimesheetStatus.APPROVED) {
      throw new BadRequestException("Bu ayın puantajı onaylanmış; izin girişi/değişikliği yapılamaz.");
    }
  }

  async createLeave(
    dto: { userId: string; leaveDate: string; startTime?: string; endTime?: string; note?: string },
    adminId: string,
  ) {
    const month = dto.leaveDate.slice(0, 7);
    await this.assertMonthNotApproved(dto.userId, month);
    if ((dto.startTime && !dto.endTime) || (!dto.startTime && dto.endTime)) {
      throw new BadRequestException("Saat aralığı için başlangıç ve bitiş birlikte verilmelidir.");
    }
    if (dto.startTime && dto.endTime && dto.endTime <= dto.startTime) {
      throw new BadRequestException("İzin bitişi başlangıçtan sonra olmalıdır.");
    }
    const leave = await this.leaves.save(
      this.leaves.create({
        userId: dto.userId,
        leaveDate: dto.leaveDate,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        note: dto.note ?? null,
        createdBy: adminId,
      }),
    );
    await this.audit.log({
      userId: adminId,
      action: "LEAVE_CREATED",
      detail: {
        leaveId: leave.id,
        targetUserId: dto.userId,
        leaveDate: dto.leaveDate,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
      },
    });
    await this.generateForMonth(month);
    return leave;
  }

  async listLeaves(periodMonth: string) {
    if (!MONTH_RE.test(periodMonth)) throw new BadRequestException("Ay formatı YYYY-AA olmalıdır.");
    const entries = await this.leaves
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.user", "user")
      .where('l."leaveDate"::text LIKE :prefix', { prefix: `${periodMonth}-%` })
      .orderBy('l."leaveDate"', "ASC")
      .getMany();
    const approved = new Set(
      (await this.timesheets.findBy({ periodMonth, status: TimesheetStatus.APPROVED })).map(
        (t) => t.userId,
      ),
    );
    return entries.map((l) => ({
      id: l.id,
      userId: l.userId,
      fullName: l.user?.fullName,
      employeeCode: l.user?.employeeCode,
      leaveDate: l.leaveDate,
      startTime: l.startTime ? l.startTime.slice(0, 5) : null,
      endTime: l.endTime ? l.endTime.slice(0, 5) : null,
      note: l.note,
      locked: approved.has(l.userId),
    }));
  }

  async deleteLeave(id: string, adminId: string) {
    const leave = await this.leaves.findOneBy({ id });
    if (!leave) throw new NotFoundException("İzin kaydı bulunamadı.");
    const month = leave.leaveDate.slice(0, 7);
    await this.assertMonthNotApproved(leave.userId, month);
    await this.leaves.delete(id);
    await this.audit.log({
      userId: adminId,
      action: "LEAVE_DELETED",
      detail: { leaveId: id, targetUserId: leave.userId, leaveDate: leave.leaveDate },
    });
    await this.generateForMonth(month);
    return { ok: true };
  }

  private monthEntries(userId: string, periodMonth: string): Promise<ExtraWorkEntry[]> {
    return this.extraWork
      .createQueryBuilder("e")
      .where("e.userId = :userId", { userId })
      .andWhere('e."workDate"::text LIKE :prefix', { prefix: `${periodMonth}-%` })
      .getMany();
  }

  /** Out-of-schedule work list for a month (admin review screen). */
  async listExtraWork(periodMonth: string, status?: ExtraWorkStatus) {
    if (!MONTH_RE.test(periodMonth)) throw new BadRequestException("Ay formatı YYYY-AA olmalıdır.");
    const qb = this.extraWork
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.user", "user")
      .where('e."workDate"::text LIKE :prefix', { prefix: `${periodMonth}-%` })
      .orderBy('e."workDate"', "ASC");
    if (status) qb.andWhere("e.status = :status", { status });
    const entries = await qb.getMany();
    // An APPROVED month locks its classifications (see classifyExtraWork).
    const approved = new Set(
      (await this.timesheets.findBy({ periodMonth, status: TimesheetStatus.APPROVED })).map(
        (t) => t.userId,
      ),
    );
    return entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      fullName: e.user?.fullName,
      employeeCode: e.user?.employeeCode,
      workDate: e.workDate,
      minutes: e.minutes,
      status: e.status,
      decidedAt: e.decidedAt,
      locked: approved.has(e.userId),
    }));
  }

  /** Admin classifies an out-of-schedule day as OVERTIME or MAKEUP. */
  async classifyExtraWork(
    id: string,
    type: ExtraWorkStatus.OVERTIME | ExtraWorkStatus.MAKEUP,
    adminId: string,
  ) {
    const entry = await this.extraWork.findOneBy({ id });
    if (!entry) throw new NotFoundException("Kayıt bulunamadı.");

    // Once the month's timesheet is APPROVED, its classifications are final.
    const entryMonth = entry.workDate.slice(0, 7);
    const monthSheet = await this.timesheets.findOneBy({
      userId: entry.userId,
      periodMonth: entryMonth,
    });
    if (monthSheet?.status === TimesheetStatus.APPROVED) {
      throw new BadRequestException(
        "Bu ayın puantajı onaylanmış; mesai sınıflandırması artık değiştirilemez.",
      );
    }

    entry.status = type;
    entry.decidedBy = adminId;
    entry.decidedAt = new Date();
    await this.extraWork.save(entry);
    await this.audit.log({
      userId: adminId,
      action: "EXTRA_WORK_CLASSIFIED",
      detail: { entryId: id, targetUserId: entry.userId, workDate: entry.workDate, type },
    });

    // Refresh the affected timesheet so the overtime total reflects the decision.
    const month = entry.workDate.slice(0, 7);
    const sheet = await this.timesheets.findOneBy({ userId: entry.userId, periodMonth: month });
    if (sheet && sheet.status !== TimesheetStatus.APPROVED) {
      const overtime = (await this.monthEntries(entry.userId, month))
        .filter((e) => e.status === ExtraWorkStatus.OVERTIME)
        .reduce((sum, e) => sum + e.minutes, 0);
      sheet.totalOvertimeMinutes = overtime;
      await this.timesheets.save(sheet);
    }
    return entry;
  }

  async approve(id: string, adminId: string): Promise<Timesheet> {
    const sheet = await this.timesheets.findOneBy({ id });
    if (!sheet) throw new NotFoundException("Puantaj kaydı bulunamadı.");
    if (sheet.status === TimesheetStatus.APPROVED) {
      throw new BadRequestException("Bu puantaj zaten onaylanmış.");
    }
    // Approval freezes classifications, so none may still be undecided.
    const pending = (await this.monthEntries(sheet.userId, sheet.periodMonth)).filter(
      (e) => e.status === ExtraWorkStatus.PENDING,
    );
    if (pending.length > 0) {
      throw new BadRequestException(
        `Bu çalışanın ${pending.length} adet sınıflandırılmamış mesai dışı çalışması var; önce bunları Fazla Mesai veya Eksik Tamamlama olarak işaretleyin.`,
      );
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
