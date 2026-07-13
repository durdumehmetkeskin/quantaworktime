import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../../entities";
import { DevicesModule } from "../devices/devices.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  // global: JwtService is also consumed by the app-wide JwtAuthGuard.
  imports: [TypeOrmModule.forFeature([User]), JwtModule.register({ global: true }), DevicesModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
