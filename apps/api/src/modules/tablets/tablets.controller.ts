import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { UserRole } from "@quanta/shared";

import type { AuthenticatedRequestUser } from "../../common/auth/jwt-payload.interface";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ClaimTabletDto,
  ProvisionTabletDto,
  SyncNoncesDto,
  TabletSignedDto,
  UpdateTabletDto,
} from "./dto/tablet.dtos";
import { TabletsService } from "./tablets.service";

@Controller("tablets")
export class TabletsController {
  constructor(private readonly tabletsService: TabletsService) {}

  // ------------------------------------------------------------------ admin

  @Post("provision")
  @Roles(UserRole.ADMIN)
  provision(@Body() dto: ProvisionTabletDto, @CurrentUser() admin: AuthenticatedRequestUser) {
    return this.tabletsService.provision(dto.name, dto.location, admin.id);
  }

  @Post(":id/rotate-secret")
  @Roles(UserRole.ADMIN)
  rotateSecret(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedRequestUser,
  ) {
    return this.tabletsService.rotateSecret(id, admin.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll() {
    return this.tabletsService.findAll();
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTabletDto) {
    return this.tabletsService.update(id, dto);
  }

  // ------------------------------------------------------------------ kiosk

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("claim")
  claim(@Body() dto: ClaimTabletDto, @Ip() ip: string) {
    return this.tabletsService.claim(dto.provisionCode, ip);
  }

  @Public()
  @Post(":id/heartbeat")
  heartbeat(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TabletSignedDto) {
    return this.tabletsService.heartbeat(id, dto.ts, dto.signature);
  }

  @Public()
  @Post(":id/nonces")
  syncNonces(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SyncNoncesDto) {
    return this.tabletsService.syncNonces(id, dto.ts, dto.signature, dto.nonces);
  }

  @Public()
  @Post(":id/recent-checkins")
  recentCheckins(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TabletSignedDto) {
    return this.tabletsService.recentCheckins(id, dto.ts, dto.signature);
  }
}
