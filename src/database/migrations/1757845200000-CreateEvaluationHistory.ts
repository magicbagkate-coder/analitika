import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvaluationHistory1757845200000 implements MigrationInterface {
  name = 'CreateEvaluationHistory1757845200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "evaluation_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chatId" character varying NOT NULL,
        "clientName" character varying NOT NULL,
        "managerNames" text[] NOT NULL,
        "score" integer NOT NULL,
        "source" character varying(32) NOT NULL,
        "note" text NOT NULL,
        "recordedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_evaluation_history" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_evaluation_history_recordedAt" ON "evaluation_history" ("recordedAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "evaluation_history"`);
  }
}
