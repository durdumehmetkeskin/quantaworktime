import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AttendanceRecord, QrNonce, Tablet } from "../../entities";
import { TabletsController } from "./tablets.controller";
import { TabletsService } from "./tablets.service";

@Module({
  imports: [TypeOrmModule.forFeature([Tablet, QrNonce, AttendanceRecord])],
  controllers: [TabletsController],
  providers: [TabletsService],
  exports: [TabletsService],
})
export class TabletsModule {}
