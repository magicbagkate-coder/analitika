import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OrderSuccessAnalysisService } from '../src/order-success-analysis/order-success-analysis.service';
import { StatusReportService } from '../src/status-report/status-report.service';

/** Manually fires the exact same twice-daily production run, without waiting for the clock. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const statusReportService = app.get(StatusReportService);
  const orderSuccessAnalysisService = app.get(OrderSuccessAnalysisService);

  console.log('--- Running "Вибір товару" status report ---');
  await statusReportService.runReport();

  console.log('--- Running "Замовлення створено" success analysis ---');
  await orderSuccessAnalysisService.runAnalysis();

  console.log('--- Done ---');
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
