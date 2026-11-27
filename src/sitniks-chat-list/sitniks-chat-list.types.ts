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
  /** The client's own id on the channel: the `sentBy` of every message the client wrote (checked live, 2026-11-27). */
  userId?: string | number;
  /** The channel the chat came from: 'instagram', 'facebook', 'telegram_private', 'viber_private'... */
  initialSource?: string;
};

export type ListChatsResponse = {
  data: ChatListItem[];
  count: number;
};
