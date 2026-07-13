import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import type { AuthenticatedRequestUser, JwtPayload } from "../auth/jwt-payload.interface";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Oturum bulunamadı. Lütfen giriş yapın.");
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(authHeader.slice(7), {
        secret: this.config.get<string>("jwt.accessSecret"),
      });
      if (payload.tokenType !== "access") {
        throw new UnauthorizedException();
      }
      const user: AuthenticatedRequestUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      (request as Request & { user: AuthenticatedRequestUser }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException("Oturum geçersiz veya süresi dolmuş.");
    }
  }
}
