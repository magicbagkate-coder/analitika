import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const KYIV_TIME_ZONE = 'Europe/Kyiv';

/** "[DD.MM.YYYY HH:mm] manager-or-client: text", one line per message, Kyiv local time. */
export function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .map((message) => `[${toKyivTime(message.createdAt)}] ${message.managerName ?? 'клієнтка'}: ${message.text}`)
    .join('\n');
}

export function toKyivTime(iso: string): string {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: KYIV_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}
