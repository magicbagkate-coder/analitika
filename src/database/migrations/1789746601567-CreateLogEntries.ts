import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLogEntries1789746601567 implements MigrationInterface {
  name = 'CreateLogEntries1789746601567';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "log_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "level" character varying(16) NOT NULL,
        "context" character varying,
        "message" text NOT NULL,
        "trace" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_log_entries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_log_entries_createdAt" ON "log_entries" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "log_entries"`);
  }
}
