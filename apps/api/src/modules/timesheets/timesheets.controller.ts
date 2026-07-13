import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches } from "class-validator";

import { ExtraWorkStatus, UserRole } from "@quanta/shared";

import type { AuthenticatedRequestUser } from "../../common/auth/jwt-payload.interface";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { TimesheetsService } from "./timesheets.service";

class ClassifyExtraWorkDto {
  @IsEnum(ExtraWorkStatus, { message: "Tip OVERTIME veya MAKEUP olmalıdır." })
  type: ExtraWorkStatus;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

class CreateLeaveDto {
  @IsUUID("4")
  userId: string;

  @IsISO8601({}, { message: "Geçersiz izin tarihi." })
  leaveDate: string;

  @IsOptional()
  @Matches(HHMM, { message: "Başlangıç saati SS:DD formatında olmalıdır." })
  startTime?: string;

  @IsOptional()
  @Matches(HHMM, { message: "Bitiş saati SS:DD formatında olmalıdır." })
  endTime?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  note?: string;
}

@Controller("timesheets")
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Get("extra-work/:month")
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  listExtraWork(@Param("month") month: string, @Query("status") status?: ExtraWorkStatus) {
    return this.timesheetsService.listExtraWork(month, status);
  }

  @Post("extra-work/:id/classify")
  @Roles(UserRole.ADMIN)
  classifyExtraWork(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ClassifyExtraWorkDto,
    @CurrentUser() admin: AuthenticatedRequestUser,
  ) {
    if (dto.type === ExtraWorkStatus.PENDING) {
      throw new BadRequestException("Tip OVERTIME veya MAKEUP olmalıdır.");
    }
    return this.timesheetsService.classifyExtraWork(id, dto.type, admin.id);
  }

  @Get("leaves/:month")
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  listLeaves(@Param("month") month: string) {
    return this.timesheetsService.listLeaves(month);
  }

  @Post("leaves")
  @Roles(UserRole.ADMIN)
  createLeave(@Body() dto: CreateLeaveDto, @CurrentUser() admin: AuthenticatedRequestUser) {
    return this.timesheetsService.createLeave(
      { ...dto, leaveDate: dto.leaveDate.slice(0, 10) },
      admin.id,
    );
  }

  @Delete("leaves/:id")
  @Roles(UserRole.ADMIN)
  deleteLeave(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() admin: AuthenticatedRequestUser) {
    return this.timesheetsService.deleteLeave(id, admin.id);
  }

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
