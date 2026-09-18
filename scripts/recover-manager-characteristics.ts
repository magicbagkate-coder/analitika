import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ManagerCharacteristicsService } from '../src/manager-characteristics/manager-characteristics.service';

/**
 * One-off recovery (2026-09-18): the 23:45 (2026-09-17) run's "Характеристика менеджерів" step
 * came back empty and silently sent nothing — see claude-manager-summary.service.ts, now logs why.
 * Re-runs just that step against the same evaluation_history rows that run already wrote (no need
 * to re-evaluate any chat), using a cutoff just before that run started.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const managerCharacteristicsService = app.get(ManagerCharacteristicsService);

  const since = new Date('2026-09-18T12:44:00Z');
  console.log(`Rebuilding manager characteristics for evaluation_history rows since ${since.toISOString()}`);

  await managerCharacteristicsService.runSummary(since);

  console.log('Done.');
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
