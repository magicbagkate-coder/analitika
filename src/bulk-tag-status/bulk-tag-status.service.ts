import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';

// Разово: проставить тег "1" на все чаты со статусом ниже (название подтверждено скриншотом Sitniks).
const TARGET_STATUS = 'ТЕСТ КАТЯ';
const TAG_TO_SET = '1';

const REPORTS_DIR = join(process.cwd(), 'reports');
const DONE_MARKER = join(REPORTS_DIR, 'bulk-tag-katya-test.done');
const LOG_FILE = join(REPORTS_DIR, 'bulk-tag-log.txt');

/**
 * One-off admin action, guarded by a marker file so it runs exactly once
 * even though the app restarts on every code change (--watch).
 * Safe to delete this whole module once the task is confirmed done.
 */
@Injectable()
export class BulkTagStatusService implements OnModuleInit {
  private readonly logger = new Logger(BulkTagStatusService.name);

  constructor(
    private readonly sitniksChatListService: SitniksChatListService,
    private readonly sitniksChatUpdateService: SitniksChatUpdateService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (await this.alreadyDone()) return;

    await mkdir(REPORTS_DIR, { recursive: true });
    const lines = [`Запуск: ${new Date().toISOString()}`, `Статус для поиска: "${TARGET_STATUS}"`, ''];

    const ranToCompletion = await this.tryRunOnce(lines);

    await writeFile(LOG_FILE, lines.join('\n'), 'utf-8');
    if (ranToCompletion) {
      await writeFile(DONE_MARKER, new Date().toISOString(), 'utf-8');
    }
    this.logger.log(`[bulk-tag] ${ranToCompletion ? 'Done' : 'Failed, marker not written'}, see reports/bulk-tag-log.txt`);
  }

  /** Runs the fetch+tag pass, returning whether it completed (so the marker is only written on success). */
  private async tryRunOnce(lines: string[]): Promise<boolean> {
    try {
      const chats = await this.fetchAllChatsForStatus();
      lines.push(`Найдено чатов со статусом "${TARGET_STATUS}": ${chats.length}`);

      const { succeeded, failed } = await this.tagAll(chats, lines);
      lines.push('', `Готово: успешно помечено ${succeeded}, ошибок ${failed}`);
      return true;
    } catch (error) {
      lines.push(`Ошибка при получении списка чатов: ${(error as Error).message}`);
      return false;
    }
  }

  private async alreadyDone(): Promise<boolean> {
    try {
      await access(DONE_MARKER);
      return true;
    } catch {
      return false;
    }
  }

  private async fetchAllChatsForStatus(): Promise<{ id: string; tags: string[] }[]> {
    const all: { id: string; tags: string[] }[] = [];
    let skip = 0;
    const limit = 50;

    for (;;) {
      const response = await this.sitniksChatListService.listChats({ status: TARGET_STATUS, skip, limit });
      all.push(...response.data.map((chat) => ({ id: chat.id, tags: chat.tags })));
      if (response.data.length < limit) break;
      skip += limit;
    }

    return all;
  }

  private async tagAll(
    chats: { id: string; tags: string[] }[],
    lines: string[],
  ): Promise<{ succeeded: number; failed: number }> {
    let succeeded = 0;
    let failed = 0;

    for (const chat of chats) {
      try {
        const tags = chat.tags.includes(TAG_TO_SET) ? chat.tags : [...chat.tags, TAG_TO_SET];
        await this.sitniksChatUpdateService.updateChat({ chatId: chat.id, tags });
        succeeded += 1;
      } catch (error) {
        failed += 1;
        lines.push(`Чат ${chat.id}: ошибка — ${(error as Error).message}`);
      }
    }

    return { succeeded, failed };
  }
}
