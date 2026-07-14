import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as argon2 from "argon2";
import { Repository } from "typeorm";

import { User } from "../../entities";
import { AuditService } from "../audit/audit.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

type SafeUser = Omit<User, "passwordHash">;

function toSafe(user: User): SafeUser {
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, actorId: string): Promise<SafeUser> {
    const email = dto.email.toLowerCase();
    if (await this.users.findOneBy({ email })) {
      throw new ConflictException("Bu e-posta adresi zaten kayıtlı.");
    }
    const user = await this.users.save(
      this.users.create({
        email,
        passwordHash: await argon2.hash(dto.password),
        fullName: dto.fullName,
        role: dto.role,
        employeeCode: dto.employeeCode ?? null,
        department: dto.department ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
    await this.audit.log({ userId: actorId, action: "USER_CREATED", detail: { newUserId: user.id, email } });
    return toSafe(user);
  }

  async findAll(): Promise<SafeUser[]> {
    const all = await this.users.find({ order: { createdAt: "DESC" } });
    return all.map(toSafe);
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı.");
    return toSafe(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<SafeUser> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı.");
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      if (await this.users.findOneBy({ email: dto.email.toLowerCase() })) {
        throw new ConflictException("Bu e-posta adresi zaten kayıtlı.");
      }
    }
    Object.assign(user, {
      ...dto,
      email: dto.email ? dto.email.toLowerCase() : user.email,
    });
    const saved = await this.users.save(user);
    await this.audit.log({ userId: actorId, action: "USER_UPDATED", detail: { targetUserId: id } });
    return toSafe(saved);
  }

  /** Admin resets a user's password (user cannot recover the old one). */
  async resetPassword(id: string, newPassword: string, actorId: string): Promise<{ ok: true }> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı.");
    user.passwordHash = await argon2.hash(newPassword);
    await this.users.save(user);
    await this.audit.log({
      userId: actorId,
      action: "USER_PASSWORD_RESET",
      detail: { targetUserId: id },
    });
    return { ok: true };
  }

  /** Soft-delete: deactivate rather than remove (attendance history must survive). */
  async deactivate(id: string, actorId: string): Promise<SafeUser> {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı.");
    user.isActive = false;
    const saved = await this.users.save(user);
    await this.audit.log({ userId: actorId, action: "USER_DEACTIVATED", detail: { targetUserId: id } });
    return toSafe(saved);
  }
}
