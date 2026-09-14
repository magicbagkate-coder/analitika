import { Injectable } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { ChatDetails } from './sitniks-chat.types';

/** Wraps GET /open-api/chats/{chatId} — fetching one chat's details, nothing else. */
@Injectable()
export class SitniksChatService {
  constructor(private readonly sitniksClient: SitniksClientService) {}

  async getChat(chatId: string): Promise<ChatDetails> {
    return this.sitniksClient.get<ChatDetails>(`/open-api/chats/${chatId}`);
  }
}
