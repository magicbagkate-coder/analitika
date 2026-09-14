import { Injectable } from '@nestjs/common';
import type { ManagerDailyStats, RecordedEvaluation } from './daily-stats-store.types';

/**
 * In-memory accumulator of today's chat evaluations, grouped by manager.
 * No database yet (by design, for now) — data lives only for as long as the
 * process runs and is cleared once a daily summary is produced from it.
 */
@Injectable()
export class DailyStatsStoreService {
  private evaluations: RecordedEvaluation[] = [];

  record(evaluation: Omit<RecordedEvaluation, 'evaluatedAt'>): void {
    this.evaluations.push({ ...evaluation, evaluatedAt: new Date() });
  }

  buildSummaryAndClear(): ManagerDailyStats[] {
    const summary = this.groupByManager(this.evaluations);
    this.evaluations = [];
    return summary;
  }

  private groupByManager(evaluations: RecordedEvaluation[]): ManagerDailyStats[] {
    const byManager = new Map<number, RecordedEvaluation[]>();
    for (const evaluation of evaluations) {
      const existing = byManager.get(evaluation.managerId) ?? [];
      existing.push(evaluation);
      byManager.set(evaluation.managerId, existing);
    }

    return Array.from(byManager.values()).map((group) => this.toManagerStats(group));
  }

  private toManagerStats(group: RecordedEvaluation[]): ManagerDailyStats {
    const totalScore = group.reduce((sum, evaluation) => sum + evaluation.score, 0);
    return {
      managerId: group[0].managerId,
      managerName: group[0].managerName,
      chatsEvaluated: group.length,
      averageScore: Math.round((totalScore / group.length) * 10) / 10,
    };
  }
}
