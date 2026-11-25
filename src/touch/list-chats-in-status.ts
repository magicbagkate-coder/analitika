import { CHAT_PAGE_SIZE, DELAY_BETWEEN_REQUESTS_MS } from './touch.constants';
import type { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';

export type ListChatsInStatusParams = {
  chatListService: SitniksChatListService;
  status: string;
  /** Only chats whose last message came on or after this moment. */
  lastMessageAfter?: Date;
};

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Every chat of a status, page by page with a pause between pages so Sitniks is not hammered. */
export async function listChatsInStatus(params: ListChatsInStatusParams): Promise<ChatListItem[]> {
  const all: ChatListItem[] = [];
  const startDate = params.lastMessageAfter?.toISOString();

  for (let skip = 0; ; skip += CHAT_PAGE_SIZE) {
    const response = await params.chatListService.listChats({ status: params.status, startDate, skip, limit: CHAT_PAGE_SIZE });
    all.push(...response.data);
    if (response.data.length < CHAT_PAGE_SIZE) return all;
    await pause(DELAY_BETWEEN_REQUESTS_MS);
  }
}
