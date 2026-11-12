import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReportTexts1794000000000 implements MigrationInterface {
  name = 'CreateReportTexts1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "report_texts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "reportAt" TIMESTAMP NOT NULL,
        "kind" character varying(16) NOT NULL,
        "subject" character varying NOT NULL,
        "text" text NOT NULL,
        "recordedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_report_texts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_report_texts_reportAt" ON "report_texts" ("reportAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "report_texts"`);
  }
}
