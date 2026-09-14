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
};
