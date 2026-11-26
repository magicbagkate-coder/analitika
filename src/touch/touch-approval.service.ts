import { Injectable, Logger } from '@nestjs/common';
import { TelegramOwnerBotService, type ButtonPress } from '../telegram/telegram-owner-bot.service';
import { TelegramService } from '../telegram/telegram.service';
import { TouchLogService } from '../touch-log/touch-log.service';
import { formatApprovalRequest } from './touch-messages';
import { TouchSenderService } from './touch-sender.service';
import type { TouchAttemptEntity } from '../touch-log/touch-attempt.entity';

const APPROVE_PREFIX = 'approve:';
const SKIP_PREFIX = 'skip:';
const EDIT_PREFIX = 'edit:';
export const FORCE_PREFIX = 'force:';
const OWNER_YES = new Set(['ок', 'ok', 'да', 'так']);
const CANCEL_WORDS = new Set(['отмена', 'отменить', 'cancel']);
const MAX_OWN_TEXT_LENGTH = 900;

/**
 * The owner's yes or no for the first touches (2026-11-20): the bot shows what it wants to send, with buttons;
 * "ок" typed in the chat approves too, but only when exactly one request waits. An approval starts the send
 * once — the row is claimed first, so a second tap does nothing. "Изменить" (2026-11-26) lets her send her own
 * text instead: it is shown for approval again, and kept as a correction the writer later learns from.
 */
@Injectable()
export class TouchApprovalService {
  private readonly logger = new Logger(TouchApprovalService.name);
  /** The touch whose text the owner is writing now; her next message is that text. */
  private editingAttemptId: string | null = null;

  constructor(
    private readonly telegramOwnerBotService: TelegramOwnerBotService,
    private readonly touchLogService: TouchLogService,
    private readonly touchSenderService: TouchSenderService,
    private readonly telegramService: TelegramService,
  ) {}

  /** `onForce` answers the "touch anyway" buttons of the skipped list; it lives outside to keep this service free of a cycle. */
  startListening(extra: { onForce: (attemptId: string) => Promise<string> }): void {
    this.telegramOwnerBotService.startPolling({
      onButton: (press) => this.handleButton({ press, onForce: extra.onForce }),
      onText: (text) => this.handleText(text),
    });
  }

  async requestApproval(attempt: TouchAttemptEntity): Promise<void> {
    const text = formatApprovalRequest({
      chatId: attempt.chatId,
      clientName: attempt.clientName,
      status: attempt.sourceStatus,
      plan: { article: attempt.article ?? '', videos: attempt.videos ?? [], messageText: attempt.messageText ?? '' },
    });
    const approvalMessageId = await this.telegramOwnerBotService.sendWithButtons({
      text,
      rows: [
        [
          { label: '✅ Отправить', data: `${APPROVE_PREFIX}${attempt.id}` },
          { label: '✏️ Изменить', data: `${EDIT_PREFIX}${attempt.id}` },
          { label: '⏭ Пропустить', data: `${SKIP_PREFIX}${attempt.id}` },
        ],
      ],
    });
    await this.touchLogService.markPendingApproval({ id: attempt.id, approvalMessageId });
  }

  private async handleButton(params: { press: ButtonPress; onForce: (attemptId: string) => Promise<string> }): Promise<string> {
    const { data } = params.press;
    if (data.startsWith(APPROVE_PREFIX)) return this.approve(data.slice(APPROVE_PREFIX.length));
    if (data.startsWith(SKIP_PREFIX)) return this.skip(data.slice(SKIP_PREFIX.length));
    if (data.startsWith(EDIT_PREFIX)) return this.startEditing(data.slice(EDIT_PREFIX.length));
    if (data.startsWith(FORCE_PREFIX)) return params.onForce(data.slice(FORCE_PREFIX.length));
    return 'Неизвестная кнопка';
  }

  private async handleText(text: string): Promise<string | null> {
    if (this.editingAttemptId !== null) return this.finishEditing(text);
    if (!OWNER_YES.has(text.trim().toLowerCase())) return null;

    const pending = await this.touchLogService.findPendingApprovals();
    if (pending.length === 0) return 'Сейчас ничего не ждёт подтверждения.';
    if (pending.length > 1) return `Ждут подтверждения ${pending.length} касаний — нажмите кнопку под нужным сообщением.`;
    return this.approve(pending[0].id);
  }

  private async startEditing(attemptId: string): Promise<string> {
    const attempt = await this.touchLogService.findById(attemptId);
    if (!attempt || attempt.state !== 'pending_approval') return 'Уже обработано';

    this.editingAttemptId = attemptId;
    await this.telegramService.sendOwnerMessage(
      `✏️ Пришлите ваш вариант текста для ${attempt.clientName} одним сообщением: я покажу его для подтверждения и запомню правку, чтобы писать так же. Чтобы оставить текст бота, напишите «отмена».`,
    );
    return 'Жду ваш текст';
  }

  /** Her message is the new text — unless she cancels or it is empty or too long for a chat message. */
  private async finishEditing(text: string): Promise<string> {
    const attemptId = this.editingAttemptId;
    const ownText = text.trim();
    if (attemptId === null) return 'Не нашла, что править.';
    if (ownText.length === 0 || ownText.length > MAX_OWN_TEXT_LENGTH) return `Текст должен быть от 1 до ${MAX_OWN_TEXT_LENGTH} символов — пришлите ещё раз.`;
    this.editingAttemptId = null;

    const attempt = await this.touchLogService.findById(attemptId);
    if (!attempt || attempt.state !== 'pending_approval') return 'Уже обработано';
    if (CANCEL_WORDS.has(ownText.toLowerCase())) {
      await this.requestApproval(attempt);
      return 'Хорошо, оставляю текст бота.';
    }

    const saved = await this.touchLogService.updatePendingMessage({ id: attemptId, messageText: ownText });
    if (!saved) return 'Уже обработано';
    await this.touchLogService.recordCorrection({ chatId: attempt.chatId, originalText: attempt.messageText ?? '', correctedText: ownText });
    await this.requestApproval({ ...attempt, messageText: ownText });
    return 'Принято. Проверьте ваш вариант и нажмите «Отправить». Правку я запомнила.';
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
