/**
 * Body for PUT /open-api/chats/{chatId}, matching Sitniks' `UpdateChatOpenApiDto`.
 * `tags` is a full replacement of the chat's tag list, not an addition — callers must
 * merge with the chat's existing tags themselves if they want to keep the old ones.
 */
export type UpdateChatParams = {
  chatId: string;
  tags?: string[];
  assignedManagerId?: number;
};
