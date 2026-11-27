import type { MigrationInterface, QueryRunner } from 'typeorm';

/** What the owner was last told about a chat's missing article or video (owner, 2026-11-27): a changed note is told again. */
export class TouchMissingAlertedKey1794600000000 implements MigrationInterface {
  name = 'TouchMissingAlertedKey1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "touch_attempts" ADD COLUMN "missingAlertedKey" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "touch_attempts" DROP COLUMN "missingAlertedKey"`);
  }
}
