import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { UserRole } from "@quanta/shared";

import type { AuthenticatedRequestUser } from "../../common/auth/jwt-payload.interface";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AttendanceVerificationService } from "./attendance-verification.service";
import { AttendanceService } from "./attendance.service";
import {
  CheckDto,
  CreateChallengeDto,
  PatchAttendanceDto,
  QueryAttendanceDto,
} from "./dto/attendance.dtos";

@Controller("attendance")
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly verificationService: AttendanceVerificationService,
  ) {}

  // Spec: attendance endpoints are limited to 10 req/min per user.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("challenge")
  createChallenge(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CreateChallengeDto) {
    return this.attendanceService.createChallenge(user.id, dto.tabletId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("check")
  check(@CurrentUser() user: AuthenticatedRequestUser, @Body() dto: CheckDto, @Ip() ip: string) {
    return this.verificationService.verifyAndRecord(user.id, dto, ip);
  }

  @Get("me")
  findMine(@CurrentUser() user: AuthenticatedRequestUser, @Query() query: QueryAttendanceDto) {
    return this.attendanceService.findForUser(user.id, query);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(@Query() query: QueryAttendanceDto) {
    return this.attendanceService.query(query);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  patch(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PatchAttendanceDto,
    @CurrentUser() admin: AuthenticatedRequestUser,
  ) {
    return this.attendanceService.patch(id, dto, admin.id);
  }
}
