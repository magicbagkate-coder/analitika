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

  /** A DB hiccup shouldn't break the evaluation/publish flow that already succeeded. */
  async tryRecord(params: RecordEvaluationParams): Promise<void> {
    try {
      await this.repository.insert(params);
    } catch (error) {
      this.logger.warn(`Could not record evaluation history for chat ${params.chatId}: ${(error as Error).message}`);
    }
  }

  async findSince(cutoff: Date): Promise<EvaluationHistoryEntity[]> {
    return this.repository.find({ where: { recordedAt: MoreThanOrEqual(cutoff) }, order: { recordedAt: 'ASC' } });
  }
}
