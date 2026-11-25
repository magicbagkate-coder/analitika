import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTouchAttempts1794100000000 implements MigrationInterface {
  name = 'CreateTouchAttempts1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "touch_attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chatId" character varying NOT NULL,
        "anchorMessageId" character varying NOT NULL,
        "clientName" character varying NOT NULL,
        "sourceStatus" character varying NOT NULL,
        "state" character varying(24) NOT NULL,
        "readSeenAt" TIMESTAMP,
        "article" character varying,
        "videoFileId" character varying,
        "videoFileName" character varying,
        "descriptionText" text,
        "questionText" text,
        "approvalMessageId" integer,
        "missingAlertedAt" TIMESTAMP,
        "touchedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_touch_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_touch_attempts_chat_anchor" UNIQUE ("chatId", "anchorMessageId")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_touch_attempts_chatId_state" ON "touch_attempts" ("chatId", "state")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "touch_attempts"`);
  }
}
