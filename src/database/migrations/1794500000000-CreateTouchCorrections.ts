import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTouchCorrections1794500000000 implements MigrationInterface {
  name = 'CreateTouchCorrections1794500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "touch_corrections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chatId" character varying NOT NULL,
        "originalText" text NOT NULL,
        "correctedText" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_touch_corrections" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_touch_corrections_createdAt" ON "touch_corrections" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "touch_corrections"`);
  }
}
