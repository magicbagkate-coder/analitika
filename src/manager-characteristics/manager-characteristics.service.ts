import { Injectable, Logger } from '@nestjs/common';
import { ClaudeManagerSummaryService } from '../claude/claude-manager-summary.service';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { TelegramService } from '../telegram/telegram.service';
import { formatManagerCharacteristics } from './manager-characteristics-formatter';
import type { ManagerRunNotes } from '../claude/claude-manager-summary.service';
import type { EvaluationHistoryEntity } from '../evaluation-history/evaluation-history.entity';

/**
 * Owner's rule (2026-09-15): a final combined per-manager characteristic at the end of the twice-
 * daily run — one score plus concrete recurring facts per manager, covering everything they touched
 * across BOTH statuses this run. Reads evaluation_history (already written by EvaluationService and
 * OrderSuccessAnalysisService during this same run) rather than taking outcomes directly from either
 * report service, so it doesn't need to know about either report's internals — see
 * ReportSchedulerService.runBoth for the `runStartedAt` cutoff this is called with.
 */
@Injectable()
export class ManagerCharacteristicsService {
  private readonly logger = new Logger(ManagerCharacteristicsService.name);

  constructor(
    private readonly evaluationHistoryService: EvaluationHistoryService,
    private readonly claudeManagerSummaryService: ClaudeManagerSummaryService,
    private readonly telegramService: TelegramService,
  ) {}

  async runSummary(since: Date): Promise<void> {
    const rows = await this.evaluationHistoryService.findSince(since);
    if (rows.length === 0) return;

    const managers = this.groupByManager(rows);
    const characteristics = await this.trySynthesize(managers);
    const text = formatManagerCharacteristics(characteristics);
    if (text.length === 0) return;

    await this.trySend(text);
  }

  private groupByManager(rows: EvaluationHistoryEntity[]): ManagerRunNotes[] {
    const byManager = new Map<string, ManagerRunNotes>();

    for (const row of rows) {
      for (const managerName of row.managerNames) {
        const manager = byManager.get(managerName) ?? { managerName, entries: [] };
        manager.entries.push({ source: row.source, score: row.score, note: row.note });
        byManager.set(managerName, manager);
      }
    }

    return Array.from(byManager.values());
  }

  /** A synthesis-call hiccup shouldn't break the reports that already sent successfully. */
  private async trySynthesize(managers: ManagerRunNotes[]) {
    try {
      return await this.claudeManagerSummaryService.synthesizeCharacteristics(managers);
    } catch (error) {
      this.logger.warn(`Could not synthesize manager characteristics: ${(error as Error).message}`);
      return [];
    }
  }

  private async trySend(text: string): Promise<void> {
    try {
      await this.telegramService.sendMessage(text);
    } catch (error) {
      this.logger.warn(`Could not send manager characteristics to Telegram: ${(error as Error).message}`);
    }
  }
}
