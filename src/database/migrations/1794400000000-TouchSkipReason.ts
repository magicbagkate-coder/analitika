import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A touch skipped because the dialog says so (owner, 2026-11-26) keeps its reason, so she can check the decision. */
export class TouchSkipReason1794400000000 implements MigrationInterface {
  name = 'TouchSkipReason1794400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "touch_attempts" ADD COLUMN "skipReason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "touch_attempts" DROP COLUMN "skipReason"`);
  }
}
