import { Injectable, Logger } from '@nestjs/common';
import { TelegramOwnerBotService, type ButtonPress } from '../telegram/telegram-owner-bot.service';
import { TouchLogService } from '../touch-log/touch-log.service';
import { formatApprovalRequest } from './touch-messages';
import { TouchSenderService } from './touch-sender.service';
import type { TouchAttemptEntity } from '../touch-log/touch-attempt.entity';

const APPROVE_PREFIX = 'approve:';
const SKIP_PREFIX = 'skip:';
const OWNER_YES = new Set(['ок', 'ok', 'да', 'так']);

/**
 * The owner's yes or no for the first touches (2026-11-20): the bot shows what it wants to send, with two
 * buttons; "ок" typed in the chat approves too, but only when exactly one request waits. An approval starts
 * the send once — the row is claimed first, so a second tap does nothing.
 */
@Injectable()
export class TouchApprovalService {
  private readonly logger = new Logger(TouchApprovalService.name);

  constructor(
    private readonly telegramOwnerBotService: TelegramOwnerBotService,
    private readonly touchLogService: TouchLogService,
    private readonly touchSenderService: TouchSenderService,
  ) {}

  startListening(): void {
    this.telegramOwnerBotService.startPolling({
      onButton: (press) => this.handleButton(press),
      onText: (text) => this.handleText(text),
    });
  }

  async requestApproval(attempt: TouchAttemptEntity): Promise<void> {
    const text = formatApprovalRequest({
      chatId: attempt.chatId,
      clientName: attempt.clientName,
      status: attempt.sourceStatus,
      plan: {
        article: attempt.article ?? '',
        videoFileId: attempt.videoFileId ?? '',
        videoFileName: attempt.videoFileName ?? '',
        messageText: attempt.messageText ?? '',
      },
    });
    const approvalMessageId = await this.telegramOwnerBotService.sendWithButtons({
      text,
      buttons: [
        { label: '✅ Отправить', data: `${APPROVE_PREFIX}${attempt.id}` },
        { label: '⏭ Пропустить', data: `${SKIP_PREFIX}${attempt.id}` },
      ],
    });
    await this.touchLogService.markPendingApproval({ id: attempt.id, approvalMessageId });
  }

  private async handleButton(press: ButtonPress): Promise<string> {
    if (press.data.startsWith(APPROVE_PREFIX)) return this.approve(press.data.slice(APPROVE_PREFIX.length));
    if (press.data.startsWith(SKIP_PREFIX)) return this.skip(press.data.slice(SKIP_PREFIX.length));
    return 'Неизвестная кнопка';
  }

  private async handleText(text: string): Promise<string | null> {
    if (!OWNER_YES.has(text.trim().toLowerCase())) return null;

    const pending = await this.touchLogService.findPendingApprovals();
    if (pending.length === 0) return 'Сейчас ничего не ждёт подтверждения.';
    if (pending.length > 1) return `Ждут подтверждения ${pending.length} касаний — нажмите кнопку под нужным сообщением.`;
    return this.approve(pending[0].id);
  }

  private async approve(attemptId: string): Promise<string> {
    const won = await this.touchLogService.claimState({ id: attemptId, from: ['pending_approval'], to: 'sending' });
    if (!won) return 'Уже обработано';

    const attempt = await this.touchLogService.findById(attemptId);
    if (!attempt) return 'Не найдено';
    void this.touchSenderService.sendTouch({ attempt, announce: true }).catch((error) => this.logger.error(`Touch send failed: ${(error as Error).message}`));
    return 'Отправляю…';
  }

  private async skip(attemptId: string): Promise<string> {
    const won = await this.touchLogService.claimState({ id: attemptId, from: ['pending_approval'], to: 'skipped' });
    return won ? 'Пропущено' : 'Уже обработано';
  }
}
