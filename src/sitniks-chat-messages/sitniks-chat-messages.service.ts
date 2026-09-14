import { Injectable } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { ListChatMessagesParams, ListChatMessagesResponse } from './sitniks-chat-messages.types';

/** Wraps GET /open-api/chats/{chatId}/messages — reading one chat's messages, nothing else. */
@Injectable()
export class SitniksChatMessagesService {
  constructor(private readonly sitniksClient: SitniksClientService) {}

  async listMessages(params: ListChatMessagesParams): Promise<ListChatMessagesResponse> {
    const { chatId, ...query } = params;
    return this.sitniksClient.get<ListChatMessagesResponse>(`/open-api/chats/${chatId}/messages`, query);
  }
}
