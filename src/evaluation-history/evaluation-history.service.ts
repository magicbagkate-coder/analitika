import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { EvaluationHistoryEntity } from './evaluation-history.entity';
import type { RecordEvaluationParams } from './evaluation-history.types';

/** Persists every evaluation for later trend analysis (see manager-trends/) — a pure history log. */
@Injectable()
export class EvaluationHistoryService {
  private readonly logger = new Logger(EvaluationHistoryService.name);

  constructor(
    @InjectRepository(EvaluationHistoryEntity)
    private readonly repository: Repository<EvaluationHistoryEntity>,
  ) {}

  /**
   * A DB hiccup shouldn't break the evaluation/publish flow that already succeeded. `note` is
   * coerced to '' if Claude's tool response ever comes back with an actual null there (observed
   * 2026-09-14 — the schema says string, but a forced tool call isn't a hard type guarantee) —
   * losing one chat's history row to a NOT NULL violation isn't worth surfacing as a real failure.
   */
  async tryRecord(params: RecordEvaluationParams): Promise<void> {
    try {
      await this.repository.insert({ ...params, note: params.note ?? '' });
    } catch (error) {
      this.logger.warn(`Could not record evaluation history for chat ${params.chatId}: ${(error as Error).message}`);
    }
  }

  async findSince(cutoff: Date): Promise<EvaluationHistoryEntity[]> {
    return this.repository.find({ where: { recordedAt: MoreThanOrEqual(cutoff) }, order: { recordedAt: 'ASC' } });
  }
}
