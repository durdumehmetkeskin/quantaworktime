import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";

import configuration, { validateEnv } from "./config/configuration";
import { CryptoModule } from "./common/crypto/crypto.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { ALL_ENTITIES } from "./entities";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DevicesModule } from "./modules/devices/devices.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ShiftsModule } from "./modules/shifts/shifts.module";
import { TabletsModule } from "./modules/tablets/tablets.module";
import { TimesheetsModule } from "./modules/timesheets/timesheets.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ["../../.env", ".env"],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.get<string>("database.host"),
        port: config.get<number>("database.port"),
        username: config.get<string>("database.username"),
        password: config.get<string>("database.password"),
        database: config.get<string>("database.name"),
        entities: ALL_ENTITIES,
        synchronize: false,
        autoLoadEntities: false,
      }),
    }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    CryptoModule,
    AuditModule,
    AuthModule,
    UsersModule,
    DevicesModule,
    TabletsModule,
    AttendanceModule,
    ShiftsModule,
    TimesheetsModule,
    ReportsModule,
  ],
  providers: [
    // Order matters: throttling first, then authentication, then authorization.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
