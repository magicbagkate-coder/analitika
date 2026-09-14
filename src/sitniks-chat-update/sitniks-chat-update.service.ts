import { Injectable } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { UpdateChatParams } from './sitniks-chat-update.types';

type UpdateChatBody = { tags?: string[]; assignedManagerId?: number };

/** Wraps PUT /open-api/chats/{chatId} — tagging a chat / reassigning its manager, nothing else. */
@Injectable()
export class SitniksChatUpdateService {
  constructor(private readonly sitniksClient: SitniksClientService) {}

  async updateChat(params: UpdateChatParams): Promise<void> {
    const body: UpdateChatBody = { tags: params.tags, assignedManagerId: params.assignedManagerId };
    await this.sitniksClient.put<void, UpdateChatBody>(`/open-api/chats/${params.chatId}`, body);
  }
}
