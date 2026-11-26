import { Injectable, Logger } from '@nestjs/common';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatSendService } from '../sitniks-chat-send/sitniks-chat-send.service';
import { TelegramService } from '../telegram/telegram.service';
import { TouchLogService } from '../touch-log/touch-log.service';
import { TouchVideoStoreService } from '../touch-video-library/touch-video-store.service';
import { MESSAGE_GAP_MS, VIDEO_CONFIRM_INTERVAL_MS, VIDEO_CONFIRM_MS } from './touch.constants';
import { formatSendTrouble, formatTouchSent } from './touch-messages';
import { hasAccountVideoSince } from './touch-video-confirm';
import type { SendChatMessageResult } from '../sitniks-chat-send/sitniks-chat-send.types';
import type { TouchAttemptEntity } from '../touch-log/touch-attempt.entity';
import type { PlannedVideo } from '../touch-log/touch-log.types';

const VIDEO_CLOCK_MARGIN_MS = 5000;
const MESSAGES_TO_CHECK = 20;

type SendStep = { name: string; result: SendChatMessageResult };
type TroubleParams = { attempt: TouchAttemptEntity; step: SendStep; nothingSent: boolean };

export type SendTouchParams = {
  attempt: TouchAttemptEntity;
  /** Tell the owner when it is done — while she still watches the first touches. */
  announce: boolean;
};

/**
 * Sends one approved touch (owner, 2026-11-25/26): the videos one by one — each one only after the previous has
 * appeared in the chat — and the moment the last has appeared one message with the warm line and the closing question. Sitniks creates the video message only after it has downloaded
 * the file, so the message must wait for it — never a fixed pause. Owner's rules (2026-11-19/20): never retry
 * anything, never send the message without the video, and any doubt goes to her private chat. The caller has
 * already moved the row to "sending", so two sends of the same touch cannot happen.
 */
@Injectable()
export class TouchSenderService {
  private readonly logger = new Logger(TouchSenderService.name);
  /** Public so a test does not have to wait for real pauses. */
  messageGapMs = MESSAGE_GAP_MS;
  confirmMs = VIDEO_CONFIRM_MS;
  confirmIntervalMs = VIDEO_CONFIRM_INTERVAL_MS;

  constructor(
    private readonly sitniksChatSendService: SitniksChatSendService,
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly touchLogService: TouchLogService,
    private readonly telegramService: TelegramService,
    private readonly touchVideoStoreService: TouchVideoStoreService,
  ) {}

  async sendTouch(params: SendTouchParams): Promise<void> {
    const { attempt } = params;
    const videos = attempt.videos ?? [];
    if (videos.length === 0 || !attempt.messageText) throw new Error(`Touch ${attempt.id} has no plan to send`);

    for (const [index, video] of videos.entries()) {
      if (index > 0) await this.delay(this.messageGapMs);
      const failure = await this.sendVideo({ attempt, video, alreadySent: index });
      if (failure) return this.finishWithTrouble(failure);
    }

    await this.delay(this.messageGapMs);
    const message = await this.sendStep({ chatId: attempt.chatId, name: 'сообщение', body: { text: attempt.messageText } });
    if (message.result.outcome !== 'sent') return this.finishWithTrouble({ attempt, step: message, nothingSent: false });

    await this.touchLogService.finishSend({ id: attempt.id, state: 'sent' });
    if (params.announce) await this.tryTell(formatTouchSent({ chatId: attempt.chatId, clientName: attempt.clientName, videoFileNames: videos.map((video) => video.fileName) }));
  }

  /** One video: sent, then awaited in the chat. Returns what went wrong, or null when it has arrived. */
  private async sendVideo(params: { attempt: TouchAttemptEntity; video: PlannedVideo; alreadySent: number }): Promise<TroubleParams | null> {
    const { attempt, video } = params;
    const startedAt = new Date(Date.now() - VIDEO_CLOCK_MARGIN_MS);
    const step = await this.sendStep({ chatId: attempt.chatId, name: `видео ${video.article}`, body: { attachments: [await this.touchVideoStoreService.buildSendUrl(video.fileId)] } });
    // Only a refusal of the very first video means nothing reached the client.
    if (step.result.outcome === 'rejected') return { attempt, step, nothingSent: params.alreadySent === 0 };
    return (await this.waitForVideo({ chatId: attempt.chatId, since: startedAt, fileId: video.fileId })) ? null : { attempt, step, nothingSent: false };
  }

  /**
   * The video shows up in the chat once Sitniks has fetched the file — a big one makes its answer a 504 first
   * (2026-11-25). The chat is watched until it does; nothing is sent again here.
   */
  private async waitForVideo(params: { chatId: string; since: Date; fileId: string }): Promise<boolean> {
    for (let waited = 0; waited < this.confirmMs; waited += this.confirmIntervalMs) {
      const response = await this.sitniksChatMessagesService.listMessages({ chatId: params.chatId, limit: MESSAGES_TO_CHECK });
      if (hasAccountVideoSince({ messagesNewestFirst: response.data, since: params.since, fileId: params.fileId })) return true;
      await this.delay(this.confirmIntervalMs);
    }
    return false;
  }

  private async sendStep(params: { chatId: string; name: string; body: { text?: string; attachments?: string[] } }): Promise<SendStep> {
    const result = await this.sitniksChatSendService.sendMessage({ chatId: params.chatId, ...params.body });
    return { name: params.name, result };
  }

  /**
   * "rejected" only when Sitniks refused the very first send, so nothing reached the client. Anything that may have
   * gone out cannot be taken back, so it is "uncertain" and never free to repeat.
   */
  private async finishWithTrouble(params: TroubleParams): Promise<void> {
    await this.touchLogService.finishSend({ id: params.attempt.id, state: params.nothingSent ? 'rejected' : 'uncertain' });
    await this.tryTell(
      formatSendTrouble({
        chatId: params.attempt.chatId,
        clientName: params.attempt.clientName,
        step: params.step.name,
        outcome: params.step.result.outcome,
        detail: params.step.result.detail,
      }),
    );
  }

  private async tryTell(text: string): Promise<void> {
    try {
      await this.telegramService.sendOwnerMessage(text);
    } catch (error) {
      this.logger.warn(`Could not tell the owner about a touch: ${(error as Error).message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
