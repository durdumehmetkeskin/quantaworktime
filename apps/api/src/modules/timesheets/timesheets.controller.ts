import { Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";

import { UserRole } from "@quanta/shared";

import type { AuthenticatedRequestUser } from "../../common/auth/jwt-payload.interface";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { TimesheetsService } from "./timesheets.service";

@Controller("timesheets")
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Get("me/:month")
  findMine(@CurrentUser() user: AuthenticatedRequestUser, @Param("month") month: string) {
    return this.timesheetsService.findMineForMonth(user.id, month);
  }

  @Get(":month")
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findForMonth(@Param("month") month: string) {
    return this.timesheetsService.findForMonth(month);
  }

  @Post(":month/generate")
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  generate(@Param("month") month: string) {
    return this.timesheetsService.generateForMonth(month);
  }

  @Post(":id/approve")
  @Roles(UserRole.ADMIN)
  approve(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedRequestUser) {
    return this.timesheetsService.approve(id, admin.id);
  }
}
