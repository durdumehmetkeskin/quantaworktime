import { Controller, Get, Query } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

import { UserRole } from "@quanta/shared";

import { Roles } from "../../common/decorators/roles.decorator";
import { AuditService } from "./audit.service";

class QueryAuditDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsUUID("4")
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

@Controller("audit-logs")
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  find(@Query() query: QueryAuditDto) {
    return this.auditService.find(query);
  }
}
