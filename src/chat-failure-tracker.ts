import { escapeHtml } from './telegram/telegram-format';

const MAX_MESSAGE_LENGTH = 200;

/**
 * Counts chats a report run couldn't process because of an error (Sitniks/Claude), as opposed to
 * chats legitimately skipped. Without it a run where every call failed (e.g. Anthropic balance gone)
 * ended with "0 evaluated" and a green "report complete" — indistinguishable from a quiet shift.
 */
export class ChatFailureTracker {
  private count = 0;
  private firstMessage: string | null = null;

  record(error: unknown): void {
    this.count += 1;
    this.firstMessage ??= (error as Error).message.slice(0, MAX_MESSAGE_LENGTH);
  }

  get failedCount(): number {
    return this.count;
  }

  /** Telegram HTML warning, or '' when nothing failed. */
  formatWarning(label: string, attempted: number): string {
    if (this.count === 0) return '';
    return `⚠️<b>${escapeHtml(label)}: не удалось обработать ${this.count} из ${attempted} чатов из-за ошибки.</b> Первая ошибка: ${escapeHtml(this.firstMessage ?? '')}`;
  }
}
