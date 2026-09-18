import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMedianResponseMinutes1789732821598 implements MigrationInterface {
  name = 'AddMedianResponseMinutes1789732821598';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "evaluation_history" ADD "medianResponseMinutes" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "evaluation_history" DROP COLUMN "medianResponseMinutes"`);
  }
}
