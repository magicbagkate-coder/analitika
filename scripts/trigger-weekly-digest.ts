import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ManagerTrendsService } from '../src/manager-trends/manager-trends.service';

/** Manually fires the weekly manager-trends digest without waiting for Monday. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const managerTrendsService = app.get(ManagerTrendsService);

  await managerTrendsService.runDigest();

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
