import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Shift, UserShift } from "../../entities";
import { AuditService } from "../audit/audit.service";
import { AssignShiftDto, CreateShiftDto, UpdateShiftDto } from "./dto/shift.dtos";

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift) private readonly shifts: Repository<Shift>,
    @InjectRepository(UserShift) private readonly userShifts: Repository<UserShift>,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreateShiftDto): Promise<Shift> {
    return this.shifts.save(this.shifts.create(dto));
  }

  findAll(): Promise<Shift[]> {
    return this.shifts.find({ order: { name: "ASC" } });
  }

  async update(id: string, dto: UpdateShiftDto): Promise<Shift> {
    const shift = await this.shifts.findOneBy({ id });
    if (!shift) throw new NotFoundException("Vardiya bulunamadı.");
    Object.assign(shift, dto);
    return this.shifts.save(shift);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const assigned = await this.userShifts.countBy({ shiftId: id });
    if (assigned > 0) {
      throw new BadRequestException("Bu vardiyaya atanmış çalışanlar var; önce atamaları kaldırın.");
    }
    await this.shifts.delete(id);
    return { ok: true };
  }

  /** Assigns a shift; closes any currently open assignment the day before. */
  async assign(dto: AssignShiftDto, adminId: string): Promise<UserShift> {
    const shift = await this.shifts.findOneBy({ id: dto.shiftId });
    if (!shift) throw new NotFoundException("Vardiya bulunamadı.");
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) {
      throw new BadRequestException("Bitiş tarihi başlangıçtan önce olamaz.");
    }

    const dayBefore = new Date(new Date(dto.effectiveFrom).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const open = await this.userShifts.find({ where: { userId: dto.userId, effectiveTo: undefined } });
    for (const assignment of open.filter((a) => a.effectiveTo === null)) {
      assignment.effectiveTo = assignment.effectiveFrom > dayBefore ? assignment.effectiveFrom : dayBefore;
      await this.userShifts.save(assignment);
    }

    const created = await this.userShifts.save(
      this.userShifts.create({
        userId: dto.userId,
        shiftId: dto.shiftId,
        effectiveFrom: dto.effectiveFrom.slice(0, 10),
        effectiveTo: dto.effectiveTo ? dto.effectiveTo.slice(0, 10) : null,
      }),
    );
    await this.audit.log({
      userId: adminId,
      action: "SHIFT_ASSIGNED",
      detail: { targetUserId: dto.userId, shiftId: dto.shiftId, effectiveFrom: dto.effectiveFrom },
    });
    return created;
  }

  findForUser(userId: string): Promise<UserShift[]> {
    return this.userShifts.find({
      where: { userId },
      relations: { shift: true },
      order: { effectiveFrom: "DESC" },
    });
  }
}
