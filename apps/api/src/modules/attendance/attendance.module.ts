import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AttendanceRecord, Challenge, QrNonce, User, UserShift } from "../../entities";
import { DevicesModule } from "../devices/devices.module";
import { TabletsModule } from "../tablets/tablets.module";
import { AttendanceVerificationService } from "./attendance-verification.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([AttendanceRecord, Challenge, QrNonce, User, UserShift]),
    TabletsModule,
    DevicesModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceVerificationService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
