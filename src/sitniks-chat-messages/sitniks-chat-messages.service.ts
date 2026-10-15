import { Injectable } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { ListChatMessagesParams, ListChatMessagesResponse } from './sitniks-chat-messages.types';

const INTERNAL_NOTE_SCOPE = 'internal_note';

/**
 * Wraps GET /open-api/chats/{chatId}/messages — reading one chat's messages, nothing else.
 * Staff-only internal notes are dropped here, at the single entry point: the client never sees them,
 * so they must not count as manager replies, evaluated content or "new messages" for re-evaluation.
 */
@Injectable()
export class SitniksChatMessagesService {
  constructor(private readonly sitniksClient: SitniksClientService) {}

  async listMessages(params: ListChatMessagesParams): Promise<ListChatMessagesResponse> {
    const { chatId, ...query } = params;
    const response = await this.sitniksClient.get<ListChatMessagesResponse>(`/open-api/chats/${chatId}/messages`, query);
    return { ...response, data: response.data.filter((message) => message.messageScope !== INTERNAL_NOTE_SCOPE) };
  }
}
