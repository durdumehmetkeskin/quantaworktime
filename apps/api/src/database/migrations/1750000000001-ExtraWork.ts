import type { MigrationInterface, QueryRunner } from "typeorm";

export class ExtraWork1750000000001 implements MigrationInterface {
  name = "ExtraWork1750000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "extra_work_status" AS ENUM ('PENDING', 'OVERTIME', 'MAKEUP')`,
    );
    await queryRunner.query(`
      CREATE TABLE "extra_work_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "workDate" date NOT NULL,
        "minutes" int NOT NULL,
        "status" "extra_work_status" NOT NULL DEFAULT 'PENDING',
        "decidedBy" uuid,
        "decidedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_extra_work_user_date" UNIQUE ("userId", "workDate")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "extra_work_entries"`);
    await queryRunner.query(`DROP TYPE "extra_work_status"`);
  }
}
