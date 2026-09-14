import { Injectable } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { ListChatsParams, ListChatsResponse } from './sitniks-chat-list.types';

/** Wraps GET /open-api/chats — listing/filtering chats, nothing else. */
@Injectable()
export class SitniksChatListService {
  constructor(private readonly sitniksClient: SitniksClientService) {}

  async listChats(params: ListChatsParams): Promise<ListChatsResponse> {
    return this.sitniksClient.get<ListChatsResponse>('/open-api/chats', params);
  }
}
