import { CHAT_MARKER_PATTERN } from './chat-link.constants';

// Claude sometimes adds words inside the bracket ("[#27, через общий контекст]"); the group is still consumed.
const CHAT_NUMBER_GROUP_PATTERN = /\[#\d[^\]]*\]/g;
const CHAT_NUMBER_TOKEN_PATTERN = /^#?(\d+)$/;

export type NumberedChatTexts = { texts: string[]; chatIds: string[] };

/** What a text carries once its chat is known: `[chat:<id>]` — the id comes from our data, never from Claude. */
export function buildChatMarker(chatId: string): string {
  return `[chat:${chatId}]`;
}

/**
 * Claude is shown short numbers `[#1]` instead of chat ids, so it cannot invent or mistype a link.
 * Turns every `[chat:<id>]` marker into the number of its id; `chatIds[n - 1]` is the chat of `[#n]`.
 */
export function numberChatMarkers(texts: string[]): NumberedChatTexts {
  const chatIds: string[] = [];
  const numbered = texts.map((text) =>
    text.replace(CHAT_MARKER_PATTERN, (_marker, chatId: string) => {
      if (!chatIds.includes(chatId)) chatIds.push(chatId);
      return `[#${chatIds.indexOf(chatId) + 1}]`;
    }),
  );
  return { texts: numbered, chatIds };
}

/**
 * The reverse for Claude's answer: `[#2]`, `[#2, #5]` become `[chat:<id>]` markers. A number that is not
 * in `chatIds` is dropped — better no link than someone else's chat.
 */
export function resolveChatNumbers(params: { text: string; chatIds: string[] }): string {
  const shown = new Set<string>();
  const resolved = params.text.replace(CHAT_NUMBER_GROUP_PATTERN, (group) => {
    const numbers = group.slice(1, -1).split(',').map((token) => CHAT_NUMBER_TOKEN_PATTERN.exec(token.trim())?.[1]);
    const chatIds = numbers.map((number) => (number ? params.chatIds[Number(number) - 1] : undefined)).filter((chatId): chatId is string => chatId !== undefined && !shown.has(chatId));
    chatIds.forEach((chatId) => shown.add(chatId));
    return [...new Set(chatIds)].map(buildChatMarker).join(' ');
  });
  return resolved.replace(/ {2,}/g, ' ').trim();
}
