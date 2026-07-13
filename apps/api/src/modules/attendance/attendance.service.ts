import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  CHALLENGE_BYTES,
  CHALLENGE_TTL_SECONDS,
  randomBytes,
  toBase64Url,
  type ChallengeResponse,
} from "@quanta/shared";

import { AttendanceRecord, Challenge } from "../../entities";
import { AuditService } from "../audit/audit.service";
import { TabletsService } from "../tablets/tablets.service";
import type { PatchAttendanceDto, QueryAttendanceDto } from "./dto/attendance.dtos";

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(Challenge) private readonly challenges: Repository<Challenge>,
    @InjectRepository(AttendanceRecord) private readonly records: Repository<AttendanceRecord>,
    private readonly tabletsService: TabletsService,
    private readonly audit: AuditService,
  ) {}

  /** Issues a single-use 16-byte challenge bound to {user, tablet}, TTL 45s. */
  async createChallenge(userId: string, tabletId: string): Promise<ChallengeResponse> {
    const tablet = await this.tabletsService.getOrThrow(tabletId);
    if (!tablet.isActive) throw new NotFoundException("Tablet aktif değil.");

    const bytes = randomBytes(CHALLENGE_BYTES);
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);
    const challenge = await this.challenges.save(
      this.challenges.create({
        userId,
        tabletId,
        challenge: Buffer.from(bytes),
        expiresAt,
      }),
    );
    return {
      challengeId: challenge.id,
      challenge: toBase64Url(bytes),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async findForUser(userId: string, query: QueryAttendanceDto) {
    return this.query({ ...query, userId });
  }

  async query(query: QueryAttendanceDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.records
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.tablet", "tablet")
      .leftJoinAndSelect("r.user", "user")
      .orderBy("r.timestamp", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.userId) qb.andWhere("r.userId = :userId", { userId: query.userId });
    if (query.tabletId) qb.andWhere("r.tabletId = :tabletId", { tabletId: query.tabletId });
    if (query.type) qb.andWhere("r.type = :type", { type: query.type });
    if (query.from) qb.andWhere("r.timestamp >= :from", { from: query.from });
    if (query.to) qb.andWhere("r.timestamp <= :to", { to: query.to });

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((r) => ({
        id: r.id,
        userId: r.userId,
        userFullName: r.user?.fullName,
        employeeCode: r.user?.employeeCode,
        tabletId: r.tabletId,
        tabletName: r.tablet?.name ?? null,
        type: r.type,
        timestamp: r.timestamp,
        lateMinutes: r.lateMinutes,
        earlyLeaveMinutes: r.earlyLeaveMinutes,
        isManual: r.isManual,
        note: r.note,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Admin manual correction — flags the record and writes an audit entry. */
  async patch(recordId: string, dto: PatchAttendanceDto, adminId: string) {
    const record = await this.records.findOneBy({ id: recordId });
    if (!record) throw new NotFoundException("Kayıt bulunamadı.");

    const before = {
      timestamp: record.timestamp,
      type: record.type,
      lateMinutes: record.lateMinutes,
      earlyLeaveMinutes: record.earlyLeaveMinutes,
    };
    if (dto.timestamp !== undefined) record.timestamp = new Date(dto.timestamp);
    if (dto.type !== undefined) record.type = dto.type;
    if (dto.lateMinutes !== undefined) record.lateMinutes = dto.lateMinutes;
    if (dto.earlyLeaveMinutes !== undefined) record.earlyLeaveMinutes = dto.earlyLeaveMinutes;
    record.isManual = true;
    record.note = dto.note;
    const saved = await this.records.save(record);

    await this.audit.log({
      userId: adminId,
      action: "ATTENDANCE_MANUAL_EDIT",
      detail: { recordId, before, after: dto },
    });
    return saved;
  }
}
