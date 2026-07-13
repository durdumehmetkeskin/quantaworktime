import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import { UserRole } from "@quanta/shared";

import { Roles } from "../../common/decorators/roles.decorator";
import { ReportsService } from "./reports.service";

@Controller("reports")
@Roles(UserRole.ADMIN, UserRole.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("daily")
  daily(@Query("date") date?: string) {
    return this.reportsService.daily(date);
  }

  @Get("monthly/export")
  async monthlyExport(@Query("month") month: string, @Res() res: Response) {
    const buffer = await this.reportsService.monthlyXlsx(month);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="puantaj-${month}.xlsx"`,
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  }
}
