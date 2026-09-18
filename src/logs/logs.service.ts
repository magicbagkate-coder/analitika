import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { LogEntryEntity } from './log-entry.entity';
import type { RecordLogParams } from './logs.types';

const RETENTION_DAYS = 3;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Owner's rule (2026-09-18): mirror every log line to the database (not just console/Docker, which
 * has no built-in size or time limit here) so past runs can be queried later, capped at
 * RETENTION_DAYS so it never grows unbounded.
 */
@Injectable()
export class LogsService implements OnModuleInit {
  constructor(
    @InjectRepository(LogEntryEntity)
    private readonly repository: Repository<LogEntryEntity>,
  ) {}

  onModuleInit(): void {
    setInterval(() => {
      this.cleanupOld().catch((error) => this.logInternalFailure(`Log cleanup failed: ${(error as Error).message}`));
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Fire-and-forget by design — called from PersistentLogger's synchronous LoggerService methods,
   * so this must never throw and never be awaited on the hot logging path. A DB hiccup here must
   * not affect (or slow down) the console output every other part of the app already relies on.
   */
  record(params: RecordLogParams): void {
    this.repository.insert({ ...params, trace: params.trace ?? null }).catch((error) => {
      this.logInternalFailure(`Could not persist log entry: ${(error as Error).message}`);
    });
  }

  /**
   * Deliberately plain `console.error`, never NestJS's `Logger` — this app installs PersistentLogger
   * as the global logger, which routes every `Logger` call (including one made right here) back
   * into `record()`. If persisting is itself what's failing, that would recurse forever.
   */
  private logInternalFailure(message: string): void {
    console.error(`[LogsService] ${message}`);
  }

  async cleanupOld(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.repository.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }
}
