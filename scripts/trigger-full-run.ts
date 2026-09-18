import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportSchedulerService } from '../src/report-scheduler/report-scheduler.service';

/**
 * One-off manual trigger (2026-09-18) — runs the exact production sequence
 * (Замовлення створено → Вибір товару → Характеристика менеджерів) on demand,
 * to verify end-to-end after today's hardening changes, without waiting for 23:45.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const reportSchedulerService = app.get(ReportSchedulerService);

  console.log('Starting full runBoth() sequence...');
  await reportSchedulerService.runBoth();
  console.log('runBoth() returned normally.');

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
