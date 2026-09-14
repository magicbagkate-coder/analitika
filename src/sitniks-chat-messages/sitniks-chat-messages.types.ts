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
};

export type ListChatMessagesResponse = {
  data: ChatMessage[];
};
