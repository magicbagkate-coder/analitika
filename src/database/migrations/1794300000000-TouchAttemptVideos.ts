import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A touch may carry several videos, one per article in the note (owner, 2026-11-26): one jsonb list replaces the two single-video columns. */
export class TouchAttemptVideos1794300000000 implements MigrationInterface {
  name = 'TouchAttemptVideos1794300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "touch_attempts" ADD COLUMN "videos" jsonb`);
    await queryRunner.query(`
      UPDATE "touch_attempts"
      SET "videos" = jsonb_build_array(jsonb_build_object('fileId', "videoFileId", 'fileName', "videoFileName", 'article', COALESCE("article", '')))
      WHERE "videoFileId" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "touch_attempts" DROP COLUMN "videoFileId"`);
    await queryRunner.query(`ALTER TABLE "touch_attempts" DROP COLUMN "videoFileName"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "touch_attempts" ADD COLUMN "videoFileId" character varying`);
    await queryRunner.query(`ALTER TABLE "touch_attempts" ADD COLUMN "videoFileName" character varying`);
    await queryRunner.query(`
      UPDATE "touch_attempts"
      SET "videoFileId" = "videos"->0->>'fileId', "videoFileName" = "videos"->0->>'fileName'
      WHERE "videos" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "touch_attempts" DROP COLUMN "videos"`);
  }
}
