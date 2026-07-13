import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as ExcelJS from "exceljs";
import { Between, Repository } from "typeorm";

import { AttendanceType, UserRole } from "@quanta/shared";

import { AttendanceRecord, User } from "../../entities";
import { toIstanbul } from "../attendance/shift-matching.util";
import { monthUtcRange } from "../timesheets/timesheets.service";
import { TimesheetsService } from "../timesheets/timesheets.service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}s ${m}dk`;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(AttendanceRecord) private readonly records: Repository<AttendanceRecord>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly timesheetsService: TimesheetsService,
  ) {}

  /** Per-employee snapshot for one Istanbul day (defaults to today). */
  async daily(dateStr?: string) {
    const date = dateStr ?? toIstanbul(new Date()).dateStr;
    if (!DATE_RE.test(date)) throw new BadRequestException("Tarih formatı YYYY-AA-GG olmalıdır.");
    const start = new Date(`${date}T00:00:00+03:00`);
    const end = new Date(`${date}T23:59:59.999+03:00`);

    const [employees, dayRecords] = await Promise.all([
      this.users.findBy({ isActive: true, role: UserRole.EMPLOYEE }),
      this.records.find({
        where: { timestamp: Between(start, end) },
        order: { timestamp: "ASC" },
      }),
    ]);

    const byUser = new Map<string, AttendanceRecord[]>();
    for (const record of dayRecords) {
      const bucket = byUser.get(record.userId) ?? [];
      bucket.push(record);
      byUser.set(record.userId, bucket);
    }

    return {
      date,
      employees: employees.map((employee) => {
        const recs = byUser.get(employee.id) ?? [];
        const firstIn = recs.find((r) => r.type === AttendanceType.IN) ?? null;
        const lastOut = [...recs].reverse().find((r) => r.type === AttendanceType.OUT) ?? null;
        const lastRecord = recs[recs.length - 1] ?? null;
        return {
          userId: employee.id,
          fullName: employee.fullName,
          employeeCode: employee.employeeCode,
          department: employee.department,
          firstIn: firstIn?.timestamp ?? null,
          lastOut: lastOut?.timestamp ?? null,
          lateMinutes: firstIn?.lateMinutes ?? 0,
          isInside: lastRecord?.type === AttendanceType.IN,
          recordCount: recs.length,
        };
      }),
    };
  }

  /** Monthly timesheet + raw records workbook (xlsx). */
  async monthlyXlsx(periodMonth: string): Promise<Buffer> {
    const sheets = await this.timesheetsService.findForMonth(periodMonth);
    const { start, end } = monthUtcRange(periodMonth);
    const monthRecords = await this.records.find({
      where: { timestamp: Between(start, end) },
      relations: { user: true, tablet: true },
      order: { timestamp: "ASC" },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Quanta Worktime Management";

    const summary = workbook.addWorksheet("Puantaj Özeti");
    summary.columns = [
      { header: "Sicil No", key: "code", width: 12 },
      { header: "Ad Soyad", key: "name", width: 28 },
      { header: "Departman", key: "dept", width: 18 },
      { header: "Çalışma", key: "worked", width: 12 },
      { header: "Geç Kalma", key: "late", width: 12 },
      { header: "Fazla Mesai", key: "overtime", width: 12 },
      { header: "Devamsızlık (gün)", key: "absent", width: 18 },
      { header: "Durum", key: "status", width: 12 },
    ];
    summary.getRow(1).font = { bold: true };
    for (const t of sheets) {
      summary.addRow({
        code: t.employeeCode,
        name: t.fullName,
        dept: t.department,
        worked: formatMinutes(t.totalWorkedMinutes),
        late: formatMinutes(t.totalLateMinutes),
        overtime: formatMinutes(t.totalOvertimeMinutes),
        absent: t.absentDays,
        status: t.status === "APPROVED" ? "Onaylı" : "Taslak",
      });
    }

    const detail = workbook.addWorksheet("Kayıtlar");
    detail.columns = [
      { header: "Tarih/Saat (İstanbul)", key: "ts", width: 22 },
      { header: "Sicil No", key: "code", width: 12 },
      { header: "Ad Soyad", key: "name", width: 28 },
      { header: "Tip", key: "type", width: 8 },
      { header: "Tablet", key: "tablet", width: 22 },
      { header: "Geç (dk)", key: "late", width: 10 },
      { header: "Erken Çıkış (dk)", key: "early", width: 16 },
      { header: "Manuel", key: "manual", width: 8 },
      { header: "Not", key: "note", width: 30 },
    ];
    detail.getRow(1).font = { bold: true };
    for (const r of monthRecords) {
      detail.addRow({
        ts: r.timestamp.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }),
        code: r.user?.employeeCode,
        name: r.user?.fullName,
        type: r.type === AttendanceType.IN ? "Giriş" : "Çıkış",
        tablet: r.tablet?.name ?? (r.isManual ? "Manuel" : "-"),
        late: r.lateMinutes,
        early: r.earlyLeaveMinutes,
        manual: r.isManual ? "Evet" : "Hayır",
        note: r.note ?? "",
      });
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
