import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReplyTimes1789985915572 implements MigrationInterface {
  name = 'CreateReplyTimes1789985915572';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reply_times" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chatId" character varying NOT NULL,
        "messageId" character varying NOT NULL,
        "managerName" character varying NOT NULL,
        "source" character varying(32) NOT NULL,
        "clientMessageAt" TIMESTAMP NOT NULL,
        "repliedAt" TIMESTAMP NOT NULL,
        "minutes" double precision NOT NULL,
        "recordedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reply_times" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reply_times_messageId" UNIQUE ("messageId")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_reply_times_repliedAt" ON "reply_times" ("repliedAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_reply_times_managerName" ON "reply_times" ("managerName")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reply_times"`);
  }
}
