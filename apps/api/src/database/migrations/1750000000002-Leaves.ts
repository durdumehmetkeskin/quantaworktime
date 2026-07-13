import type { MigrationInterface, QueryRunner } from "typeorm";

export class Leaves1750000000002 implements MigrationInterface {
  name = "Leaves1750000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "leave_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "leaveDate" date NOT NULL,
        "startTime" time,
        "endTime" time,
        "note" text,
        "createdBy" uuid NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_leave_user_date" ON "leave_entries" ("userId", "leaveDate")`,
    );
    await queryRunner.query(
      `ALTER TABLE "timesheets" ADD COLUMN "totalLeaveMinutes" int NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "timesheets" DROP COLUMN "totalLeaveMinutes"`);
    await queryRunner.query(`DROP TABLE "leave_entries"`);
  }
}
