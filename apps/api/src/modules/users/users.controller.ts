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
import { IsString, MinLength } from "class-validator";

import { UserRole } from "@quanta/shared";

import type { AuthenticatedRequestUser } from "../../common/auth/jwt-payload.interface";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: "Şifre en az 8 karakter olmalıdır." })
  password: string;
}

@Controller("users")
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post(":id/password")
  @Roles(UserRole.ADMIN)
  resetPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ) {
    return this.usersService.resetPassword(id, dto.password, actor.id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedRequestUser) {
    return this.usersService.create(dto, actor.id);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ) {
    return this.usersService.update(id, dto, actor.id);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  deactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedRequestUser,
  ) {
    return this.usersService.deactivate(id, actor.id);
  }
}
