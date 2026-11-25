import { Injectable } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { ChangeChatStatusParams } from './sitniks-chat-status.types';

/** Wraps PATCH /open-api/chats/{chatId}/status — moving a chat to another status, nothing else. */
@Injectable()
export class SitniksChatStatusService {
  constructor(private readonly sitniksClient: SitniksClientService) {}

  async changeStatus(params: ChangeChatStatusParams): Promise<void> {
    await this.sitniksClient.patch<void, { status: string }>(`/open-api/chats/${params.chatId}/status`, { status: params.status });
  }
}
