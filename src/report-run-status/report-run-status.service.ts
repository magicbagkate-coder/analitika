import { Injectable, Logger } from '@nestjs/common';

// If a run somehow never clears despite the finally-block fix (a true hang), don't disable
// ConflictWatcher forever — expire the "busy" state after this ceiling.
const MAX_RUN_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Tracks whether the twice-daily report (ReportSchedulerService.runBoth) is currently running, so
 * ConflictWatcherService can skip its own poll cycle entirely while it's active. Owner's
 * contractor's explicit rule (2026-09-16): Node is single-threaded and the two independent timers
 * hitting the same Sitniks API caused a confirmed 429 collision (2026-09-15) — while the report
 * runs, nothing else should be calling the same API.
 *
 * Deliberately a simple in-memory flag checked periodically by ConflictWatcher's own tick, not a
 * blocking await on the report's promise — that keeps the two loosely coupled (a crash in one
 * can't wedge the other), and `isBusy`'s age ceiling means a genuinely stuck run doesn't disable
 * conflict watching forever.
 */
@Injectable()
export class ReportRunStatusService {
  private readonly logger = new Logger(ReportRunStatusService.name);
  private startedAt: Date | null = null;

  start(): void {
    this.startedAt = new Date();
  }

  finish(): void {
    this.startedAt = null;
  }

  isBusy(): boolean {
    if (!this.startedAt) return false;

    const ageMs = Date.now() - this.startedAt.getTime();
    if (ageMs > MAX_RUN_AGE_MS) {
      this.logger.warn(`Report run has been "in progress" for over ${MAX_RUN_AGE_MS / 3_600_000}h — treating as stale, resuming conflict watch`);
      return false;
    }

    return true;
  }
}
