import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OrderSuccessAnalysisService } from '../src/order-success-analysis/order-success-analysis.service';

/** Manually fires only the "Замовлення створено" analysis — used to re-test after a criteria change. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const orderSuccessAnalysisService = app.get(OrderSuccessAnalysisService);

  await orderSuccessAnalysisService.runAnalysis();

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
