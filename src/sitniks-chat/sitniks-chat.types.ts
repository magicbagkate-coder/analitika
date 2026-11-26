/**
 * Single chat details from GET /open-api/chats/{chatId}.
 * TODO: same caveat as chat-list — confirm exact field names once we can see
 * the full `ChatEntity` schema from Sitniks.
 */
export type ChatDetails = {
  id: string;
  status: string;
  tags: string[];
  assignedManagerId: number | null;
  clientId: string | null;
  // The real answer carries the same fields as a chat-list item (seen live); the touch bot needs them to treat the chat like one.
  lastMessageCreatedAt?: string;
  userName?: string;
  userNickName?: string;
  initialSource?: string;
};
