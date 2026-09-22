import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReplyTimeEntity } from './reply-time.entity';
import type { ManagerReplySpeed, RecordRepliesParams, ReplyTimeRow, ShiftWindow } from './reply-times.types';

const INSERT_CHUNK_SIZE = 500;

/**
 * Persists each manager reply's wait time so speed can be sliced per manager, shift or day.
 * Owner's instruction (2026-09-21): nothing may touch the DB while a report is being built — replies
 * are only queued in memory (queue) and written after the whole report is out (flush).
 */
@Injectable()
export class ReplyTimesService {
  private readonly logger = new Logger(ReplyTimesService.name);
  private pending: ReplyTimeRow[] = [];

  constructor(
    @InjectRepository(ReplyTimeEntity)
    private readonly repository: Repository<ReplyTimeEntity>,
  ) {}

  queue(params: RecordRepliesParams): void {
    const rows = params.replies.map((reply) => ({
      chatId: params.chatId,
      messageId: reply.messageId,
      managerName: reply.managerName,
      source: params.source,
      clientMessageAt: reply.clientMessageAt,
      repliedAt: reply.repliedAt,
      minutes: reply.minutes,
    }));
    this.pending.push(...rows);
  }

  /**
   * Never throws. Every run re-reads the same 72h window, so replies seen before are silently
   * skipped (unique messageId) instead of duplicated. A failed chunk is logged and dropped — the
   * same replies come back on the next run while they're still inside the window.
   */
  async flush(): Promise<void> {
    const rows = this.pending;
    this.pending = [];

    for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
      await this.tryInsert(rows.slice(start, start + INSERT_CHUNK_SIZE));
    }
  }

  /** Average wait per manager over replies made inside the window, busiest manager first. */
  async findSpeedByManager(window: ShiftWindow): Promise<ManagerReplySpeed[]> {
    const rows = await this.repository
      .createQueryBuilder('reply')
      .select('reply.managerName', 'managerName')
      .addSelect('COUNT(*)', 'replies')
      .addSelect('AVG(reply.minutes)', 'averageMinutes')
      .where('reply.repliedAt >= :since AND reply.repliedAt < :until', window)
      .groupBy('reply.managerName')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany<{ managerName: string; replies: string; averageMinutes: string }>();

    return rows.map((row) => ({ managerName: row.managerName, replies: Number(row.replies), averageMinutes: Number(row.averageMinutes) }));
  }

  private async tryInsert(rows: ReplyTimeRow[]): Promise<void> {
    try {
      await this.repository.createQueryBuilder().insert().values(rows).orIgnore().execute();
    } catch (error) {
      this.logger.warn(`Could not record ${rows.length} reply times: ${(error as Error).message}`);
    }
  }
}
