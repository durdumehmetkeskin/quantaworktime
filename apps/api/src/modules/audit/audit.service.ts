import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AuditLog } from "../../entities";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /** Fire-and-forget safe write — auditing must never break the main flow. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          userId: entry.userId ?? null,
          action: entry.action,
          detail: entry.detail ?? {},
          ip: entry.ip ?? null,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to write audit log (${entry.action})`, err as Error);
    }
  }

  async find(filter: {
    action?: string;
    userId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: AuditLog[]; total: number }> {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
    const qb = this.repo.createQueryBuilder("a").orderBy("a.createdAt", "DESC");
    if (filter.action) qb.andWhere("a.action = :action", { action: filter.action });
    if (filter.userId) qb.andWhere("a.userId = :userId", { userId: filter.userId });
    const [items, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items, total };
  }
}
