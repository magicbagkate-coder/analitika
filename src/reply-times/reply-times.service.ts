import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReplyTimeEntity } from './reply-time.entity';
import type { RecordRepliesParams } from './reply-times.types';

/** Persists each manager reply's wait time so speed can be sliced per manager, shift or day. */
@Injectable()
export class ReplyTimesService {
  private readonly logger = new Logger(ReplyTimesService.name);

  constructor(
    @InjectRepository(ReplyTimeEntity)
    private readonly repository: Repository<ReplyTimeEntity>,
  ) {}

  /**
   * A DB hiccup shouldn't break the evaluation flow that already succeeded. Every run re-reads the
   * same 72h window, so replies seen before are silently skipped (unique messageId) instead of
   * duplicated.
   */
  async tryRecord(params: RecordRepliesParams): Promise<void> {
    if (params.replies.length === 0) return;

    const rows = params.replies.map((reply) => ({
      chatId: params.chatId,
      messageId: reply.messageId,
      managerName: reply.managerName,
      source: params.source,
      clientMessageAt: reply.clientMessageAt,
      repliedAt: reply.repliedAt,
      minutes: reply.minutes,
    }));

    try {
      await this.repository.createQueryBuilder().insert().values(rows).orIgnore().execute();
    } catch (error) {
      this.logger.warn(`Could not record reply times for chat ${params.chatId}: ${(error as Error).message}`);
    }
  }
}
