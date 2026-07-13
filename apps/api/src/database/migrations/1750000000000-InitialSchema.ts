import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1750000000000 implements MigrationInterface {
  name = "InitialSchema1750000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_role" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "device_status" AS ENUM ('ACTIVE', 'PENDING_APPROVAL', 'REVOKED')`,
    );
    await queryRunner.query(`CREATE TYPE "attendance_type" AS ENUM ('IN', 'OUT')`);
    await queryRunner.query(`CREATE TYPE "timesheet_status" AS ENUM ('DRAFT', 'APPROVED')`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL,
        "passwordHash" varchar NOT NULL,
        "fullName" varchar NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'EMPLOYEE',
        "employeeCode" varchar,
        "department" varchar,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "uq_users_employee_code" UNIQUE ("employeeCode")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "deviceKeyEncrypted" text NOT NULL,
        "platform" varchar NOT NULL,
        "model" varchar NOT NULL,
        "registeredAt" timestamptz NOT NULL DEFAULT now(),
        "status" "device_status" NOT NULL DEFAULT 'PENDING_APPROVAL'
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_devices_user" ON "devices" ("userId")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "devices_one_active_per_user" ON "devices" ("userId") WHERE "status" = 'ACTIVE'`,
    );

    await queryRunner.query(`
      CREATE TABLE "tablets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "location" varchar NOT NULL,
        "tabletSecretEncrypted" text,
        "provisionCodeHash" varchar,
        "provisionCodeExpiresAt" timestamptz,
        "isActive" boolean NOT NULL DEFAULT true,
        "lastSeenAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_tablets_provision_code" UNIQUE ("provisionCodeHash")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "qr_nonces" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tabletId" uuid NOT NULL REFERENCES "tablets"("id") ON DELETE CASCADE,
        "nonce" varchar NOT NULL,
        "issuedTs" bigint NOT NULL,
        "usedAt" timestamptz,
        "usedByUserId" uuid,
        CONSTRAINT "uq_qr_nonces_nonce" UNIQUE ("nonce")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_qr_nonces_tablet_issued" ON "qr_nonces" ("tabletId", "issuedTs")`,
    );

    await queryRunner.query(`
      CREATE TABLE "challenges" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tabletId" uuid NOT NULL REFERENCES "tablets"("id") ON DELETE CASCADE,
        "challenge" bytea NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_challenges_user" ON "challenges" ("userId")`);

    await queryRunner.query(`
      CREATE TABLE "attendance_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tabletId" uuid REFERENCES "tablets"("id") ON DELETE SET NULL,
        "type" "attendance_type" NOT NULL,
        "timestamp" timestamptz NOT NULL,
        "challengeId" uuid,
        "lateMinutes" int NOT NULL DEFAULT 0,
        "earlyLeaveMinutes" int NOT NULL DEFAULT 0,
        "isManual" boolean NOT NULL DEFAULT false,
        "note" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_attendance_user_ts" ON "attendance_records" ("userId", "timestamp")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_attendance_ts" ON "attendance_records" ("timestamp")`,
    );

    await queryRunner.query(`
      CREATE TABLE "shifts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "startTime" time NOT NULL,
        "endTime" time NOT NULL,
        "graceMinutes" int NOT NULL DEFAULT 0,
        "workDays" int NOT NULL DEFAULT 31,
        "breakMinutes" int NOT NULL DEFAULT 60
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_shifts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "shiftId" uuid NOT NULL REFERENCES "shifts"("id") ON DELETE CASCADE,
        "effectiveFrom" date NOT NULL,
        "effectiveTo" date
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_user_shifts_user_from" ON "user_shifts" ("userId", "effectiveFrom")`,
    );

    await queryRunner.query(`
      CREATE TABLE "timesheets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "periodMonth" varchar(7) NOT NULL,
        "totalWorkedMinutes" int NOT NULL DEFAULT 0,
        "totalLateMinutes" int NOT NULL DEFAULT 0,
        "totalOvertimeMinutes" int NOT NULL DEFAULT 0,
        "absentDays" int NOT NULL DEFAULT 0,
        "status" "timesheet_status" NOT NULL DEFAULT 'DRAFT',
        "approvedBy" uuid,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_timesheets_user_period" UNIQUE ("userId", "periodMonth")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid,
        "action" varchar NOT NULL,
        "detail" jsonb NOT NULL DEFAULT '{}',
        "ip" varchar,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_audit_user" ON "audit_logs" ("userId")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_action" ON "audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_created" ON "audit_logs" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "timesheets"`);
    await queryRunner.query(`DROP TABLE "user_shifts"`);
    await queryRunner.query(`DROP TABLE "shifts"`);
    await queryRunner.query(`DROP TABLE "attendance_records"`);
    await queryRunner.query(`DROP TABLE "challenges"`);
    await queryRunner.query(`DROP TABLE "qr_nonces"`);
    await queryRunner.query(`DROP TABLE "tablets"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "timesheet_status"`);
    await queryRunner.query(`DROP TYPE "attendance_type"`);
    await queryRunner.query(`DROP TYPE "device_status"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
