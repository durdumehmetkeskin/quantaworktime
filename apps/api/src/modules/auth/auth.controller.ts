import { Body, Controller, Ip, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type { AuthenticatedRequestUser } from "../../common/auth/jwt-payload.interface";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { DevicesService } from "../devices/devices.service";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDeviceDto } from "./dto/register-device.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly devicesService: DevicesService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto.email, dto.password, ip, dto.deviceFingerprint);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken, dto.deviceFingerprint);
  }

  @Post("register-device")
  async registerDevice(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: RegisterDeviceDto,
    @Ip() ip: string,
  ) {
    const device = await this.devicesService.register(
      user.id,
      dto.deviceKey,
      dto.platform,
      dto.model,
      ip,
    );
    return {
      id: device.id,
      status: device.status,
      message: "Cihaz kaydınız alındı. Yönetici onayı bekleniyor.",
    };
  }
}
