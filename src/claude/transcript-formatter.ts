import { getCanonicalManagerName } from '../evaluation/manager-roles.constants';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const KYIV_TIME_ZONE = 'Europe/Kyiv';
const BOT_SPEAKER_LABEL = 'АВТОМАТИЧНИЙ БОТ Instagram';

// Sitniks sends a photo/video as its own message with EMPTY text (messageType image/video). Without
// a marker those read as blank lines, and Claude reported a manager for "spamming empty messages"
// when she was sending the colour photos exactly as the rules require (2026-09-21).
const MEDIA_LABELS = new Map([
  ['image', '[фото]'],
  ['video', '[відео]'],
]);
const UNKNOWN_ATTACHMENT_LABEL = '[вкладення]';

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
    .map((message) => `[${toKyivTime(message.createdAt)}] ${speakerLabel(message, accountSentBy)}: ${messageContent(message)}${unreadMarker(message)}`)
    .join('\n');
}

function messageContent(message: ChatMessage): string {
  return [mediaLabel(message), message.text].filter((part) => part.length > 0).join(' ');
}

/** Known media types are always labelled; an unrecognised non-text type only when it has no text to show. */
function mediaLabel(message: ChatMessage): string {
  const knownLabel = message.messageType ? MEDIA_LABELS.get(message.messageType) : undefined;
  if (knownLabel) return knownLabel;

  const isUnknownNonText = message.messageType !== undefined && message.messageType !== 'text';
  return isUnknownNonText && message.text.trim().length === 0 ? UNKNOWN_ATTACHMENT_LABEL : '';
}

function speakerLabel(message: ChatMessage, accountSentBy: string | undefined): string {
  // Resolved to the canonical name so a manager who appears under a short name in one message and
  // the full name in another still reads as ONE consistent person across the whole transcript.
  if (message.managerName) return getCanonicalManagerName(message.managerName);
  if (accountSentBy && message.sentBy === accountSentBy) return BOT_SPEAKER_LABEL;
  return 'клієнтка';
}

/**
 * Owner's rule (2026-09-18): касатель/менеджери не роблять повторне касання, якщо клієнтка ще не
 * прочитала попереднє повідомлення — не спамимо в непрочитаний чат. Only meaningful on a
 * staff-authored message (Sitniks' `isViewedByUser` tracks whether the CLIENT viewed it).
 */
function unreadMarker(message: ChatMessage): string {
  return message.managerName && !message.isViewedByUser ? ' [клієнтка ЩЕ НЕ прочитала це повідомлення]' : '';
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
