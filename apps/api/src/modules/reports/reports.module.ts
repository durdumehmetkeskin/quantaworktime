import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AttendanceRecord, User } from "../../entities";
import { TimesheetsModule } from "../timesheets/timesheets.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [TypeOrmModule.forFeature([AttendanceRecord, User]), TimesheetsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
