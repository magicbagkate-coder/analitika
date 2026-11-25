import type { MigrationInterface, QueryRunner } from 'typeorm';

/** The touch is now a video plus ONE message (owner, 2026-11-25), so the two text columns become one. */
export class MergeTouchTexts1794200000000 implements MigrationInterface {
  name = 'MergeTouchTexts1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "touch_attempts" RENAME COLUMN "descriptionText" TO "messageText"`);
    await queryRunner.query(`ALTER TABLE "touch_attempts" DROP COLUMN "questionText"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "touch_attempts" ADD COLUMN "questionText" text`);
    await queryRunner.query(`ALTER TABLE "touch_attempts" RENAME COLUMN "messageText" TO "descriptionText"`);
  }
}
