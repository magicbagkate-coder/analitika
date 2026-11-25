import { Injectable, Logger } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { SendChatMessageParams, SendChatMessageResult } from './sitniks-chat-send.types';

type SendBody = { text?: string; attachments?: string[] };
type HttpFailure = { response?: { status?: number }; message?: string };

const CLIENT_ERROR_FROM = 400;
const SERVER_ERROR_FROM = 500;

/**
 * Wraps POST /open-api/chats/{chatId}/messages. It never retries and never throws on an HTTP error:
 * the caller gets what is known about delivery and decides, because a blind second send duplicated
 * a video to a real client (2026-11-19).
 */
@Injectable()
export class SitniksChatSendService {
  private readonly logger = new Logger(SitniksChatSendService.name);

  constructor(private readonly sitniksClient: SitniksClientService) {}

  async sendMessage(params: SendChatMessageParams): Promise<SendChatMessageResult> {
    const body: SendBody = { text: params.text, attachments: params.attachments };
    try {
      await this.sitniksClient.post<unknown, SendBody>(`/open-api/chats/${params.chatId}/messages`, body);
      return { outcome: 'sent', detail: 'accepted' };
    } catch (error) {
      return this.describeFailure(params.chatId, error as HttpFailure);
    }
  }

  private describeFailure(chatId: string, failure: HttpFailure): SendChatMessageResult {
    const status = failure.response?.status;
    this.logger.warn(`Sending to chat ${chatId} failed: ${status ?? 'no response'} ${failure.message ?? ''}`);
    const isRefused = status !== undefined && status >= CLIENT_ERROR_FROM && status < SERVER_ERROR_FROM;
    return { outcome: isRefused ? 'rejected' : 'uncertain', detail: `${status ?? 'no response'}` };
  }
}
