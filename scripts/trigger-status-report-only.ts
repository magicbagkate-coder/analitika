import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StatusReportService } from '../src/status-report/status-report.service';

/** Manually fires only the "Вибір товару" status report. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const statusReportService = app.get(StatusReportService);

  await statusReportService.runReport();

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
