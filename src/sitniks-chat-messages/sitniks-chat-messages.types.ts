export type ListChatMessagesParams = {
  chatId: string;
  skip?: number;
  limit?: number;
  isComment?: boolean;
};

/** One message. Confirmed against Sitniks' `ChatMessageOpenApiEntity` schema. */
export type ChatMessage = {
  id: string;
  sentBy: string;
  managerName?: string;
  text: string;
  createdAt: string;
  /** Whether the CLIENT has opened/viewed this message yet — confirmed against a live response. */
  isViewedByUser: boolean;
  /** "text", "image" or "video" seen live — photo/video messages arrive with an empty `text`. */
  messageType?: string;
};

export type ListChatMessagesResponse = {
  data: ChatMessage[];
};
