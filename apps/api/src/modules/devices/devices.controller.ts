import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";

import { DeviceStatus, UserRole } from "@quanta/shared";

import type { AuthenticatedRequestUser } from "../../common/auth/jwt-payload.interface";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { DevicesService } from "./devices.service";

@Controller("devices")
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(@Query("status") status?: DeviceStatus) {
    return this.devicesService.findAll(status);
  }

  @Get("me")
  async findMine(@CurrentUser() user: AuthenticatedRequestUser) {
    const device = await this.devicesService.findMine(user.id);
    if (!device) return null;
    const { deviceKeyEncrypted: _omit, ...safe } = device;
    return safe;
  }

  @Post(":id/approve")
  @Roles(UserRole.ADMIN)
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return this.devicesService.approve(id, user.id);
  }

  @Post(":id/revoke")
  @Roles(UserRole.ADMIN)
  revoke(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequestUser,
  ) {
    return this.devicesService.revoke(id, user.id);
  }
}
