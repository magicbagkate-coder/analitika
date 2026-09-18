import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { PersistentLogger } from './logs/persistent-logger';

/**
 * Node terminates the whole process on an unhandled promise rejection by default (Node 15+) — one
 * real incident (2026-09-15) proved this: a single unguarded field in one report step became an
 * unhandled rejection and killed the entire app mid-run, taking down the still-running "Вибір
 * товару" evaluation AND every unrelated background loop (ConflictWatcherService, ManagerTrends,
 * etc.) with it. Individual services already try/catch their own risky calls (see e.g.
 * report-watchdog.ts), but this is the last line of defense for whatever future bug slips past
 * that — log it and keep the process alive instead of crashing everything over one bad step.
 */
process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  new Logger('UnhandledRejection').error(`Unhandled promise rejection (process kept running): ${error.message}`, error.stack);
});

async function bootstrap(): Promise<void> {
  // bufferLogs holds every log call made during startup (including inside modules that run code in
  // their constructors/onModuleInit) until useLogger below is actually wired in, so nothing from
  // boot is lost to the console-only default logger before PersistentLogger takes over.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PersistentLogger));

  const appConfig = app.get(AppConfigService);
  await app.listen(appConfig.getPort());
}

bootstrap();
