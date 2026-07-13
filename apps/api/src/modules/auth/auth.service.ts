import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as argon2 from "argon2";
import { Repository } from "typeorm";

import type { AuthTokens, LoginResponse } from "@quanta/shared";

import type { JwtPayload } from "../../common/auth/jwt-payload.interface";
import { User } from "../../entities";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ip?: string): Promise<LoginResponse> {
    const user = await this.users.findOneBy({ email: email.toLowerCase() });
    const passwordOk = user ? await argon2.verify(user.passwordHash, password) : false;

    if (!user || !passwordOk || !user.isActive) {
      await this.audit.log({
        userId: user?.id ?? null,
        action: "LOGIN_FAILED",
        detail: { email, reason: !user ? "unknown_user" : !passwordOk ? "bad_password" : "inactive" },
        ip,
      });
      throw new UnauthorizedException("E-posta veya şifre hatalı.");
    }

    const tokens = await this.issueTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        employeeCode: user.employeeCode,
        department: user.department,
      },
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>("jwt.refreshSecret"),
      });
    } catch {
      throw new UnauthorizedException("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
    }
    if (payload.tokenType !== "refresh") {
      throw new UnauthorizedException("Geçersiz yenileme anahtarı.");
    }
    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Hesap aktif değil.");
    }
    return this.issueTokens(user);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const base = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(
      { ...base, tokenType: "access" } satisfies JwtPayload,
      {
        secret: this.config.get<string>("jwt.accessSecret"),
        expiresIn: this.config.get<string>("jwt.accessTtl"),
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      { ...base, tokenType: "refresh" } satisfies JwtPayload,
      {
        secret: this.config.get<string>("jwt.refreshSecret"),
        expiresIn: this.config.get<string>("jwt.refreshTtl"),
      },
    );
    return { accessToken, refreshToken };
  }
}
