/** Filters accepted by GET /open-api/chats. Field names confirmed against Sitniks' open-api spec. */
export type ListChatsParams = {
  status?: string;
  tags?: string[];
  skip?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
};

/** One item from the chat list response. Confirmed against Sitniks' `ChatEntity` schema and a live response. */
export type ChatListItem = {
  id: string;
  status: string;
  tags: string[];
  assignedManagerId?: number | null;
  lastMessageCreatedAt: string;
  userName: string;
  userNickName?: string;
};

export type ListChatsResponse = {
  data: ChatListItem[];
  count: number;
};
