import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";

import { UserRole } from "@quanta/shared";

import type { AuthenticatedRequestUser } from "../../common/auth/jwt-payload.interface";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AssignShiftDto, CreateShiftDto, UpdateShiftDto } from "./dto/shift.dtos";
import { ShiftsService } from "./shifts.service";

@Controller("shifts")
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateShiftDto) {
    return this.shiftsService.create(dto);
  }

  @Get()
  findAll() {
    return this.shiftsService.findAll();
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateShiftDto) {
    return this.shiftsService.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.shiftsService.remove(id);
  }

  @Post("assign")
  @Roles(UserRole.ADMIN)
  assign(@Body() dto: AssignShiftDto, @CurrentUser() admin: AuthenticatedRequestUser) {
    return this.shiftsService.assign(dto, admin.id);
  }

  @Get("user/:userId")
  findForUser(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.shiftsService.findForUser(userId);
  }
}
