import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AttendanceRecord, ExtraWorkEntry, LeaveEntry, Timesheet, User, UserShift } from "../../entities";
import { TimesheetsController } from "./timesheets.controller";
import { TimesheetsService } from "./timesheets.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Timesheet, User, AttendanceRecord, UserShift, ExtraWorkEntry, LeaveEntry]),
  ],
  controllers: [TimesheetsController],
  providers: [TimesheetsService],
  exports: [TimesheetsService],
})
export class TimesheetsModule {}
