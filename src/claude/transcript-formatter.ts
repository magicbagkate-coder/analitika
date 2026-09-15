import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const KYIV_TIME_ZONE = 'Europe/Kyiv';
const BOT_SPEAKER_LABEL = 'АВТОМАТИЧНИЙ БОТ Instagram';

/**
 * "[DD.MM.YYYY HH:mm] manager-or-client-or-bot: text", one line per message, Kyiv local time.
 *
 * Sitniks gives no field for "this is the Manychat/Instagram auto-responder, not a person" — a bot
 * message has no `managerName`, same as a client message, and reuses the account's own `sentBy`,
 * same as an actual manager's message (confirmed 2026-09-15: a "Вітаю! Гарний вибір!.. Вартість N
 * грн" auto-reply came back with `managerName: undefined`, `sentBy` equal to the account's own id).
 * Naively falling back to "клієнтка" for any unnamed message — the old behavior — put the bot's own
 * promotional text in the client's mouth, which could seriously mislead a quality read. The only
 * distinguishing signal available is `sentBy`: any manager-attributed message in the SAME chat
 * reveals the account's own `sentBy` value, so an unnamed message sharing that same `sentBy` is the
 * bot, not the client — everything else unnamed is a genuine client message.
 */
export function formatTranscript(messages: ChatMessage[]): string {
  const accountSentBy = messages.find((message) => message.managerName)?.sentBy;

  return messages
    .map((message) => `[${toKyivTime(message.createdAt)}] ${speakerLabel(message, accountSentBy)}: ${message.text}`)
    .join('\n');
}

function speakerLabel(message: ChatMessage, accountSentBy: string | undefined): string {
  if (message.managerName) return message.managerName;
  if (accountSentBy && message.sentBy === accountSentBy) return BOT_SPEAKER_LABEL;
  return 'клієнтка';
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
