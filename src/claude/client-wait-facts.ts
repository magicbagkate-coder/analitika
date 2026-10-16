import { calculateReplyIntervals } from '../evaluation/response-time';
import { toKyivTime } from './transcript-formatter';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const MAX_FACT_LINES = 20;

// A tap on the bot's price button is answered by the bot itself (it posts the price), so no manager reply is due.
const BOT_BUTTON_TEXTS = new Set(['дізнатись ціну', '⬇натисніть тут⬇']);

/**
 * "How long did the client wait for each manager reply" as plain lines for the evaluation prompt —
 * computed in code from message timestamps (open-hours minutes), so Claude quotes numbers instead of
 * doing its own time arithmetic. `messages` is newest-first, the Sitniks order.
 */
export function describeClientWaits(messages: ChatMessage[]): string {
  const buttonTapTimes = new Set(
    messages.filter((message) => !message.managerName && BOT_BUTTON_TEXTS.has(message.text.trim().toLowerCase())).map((message) => Date.parse(message.createdAt)),
  );
  const lines = calculateReplyIntervals(messages)
    .filter((reply) => !buttonTapTimes.has(reply.clientMessageAt.getTime()))
    .slice(-MAX_FACT_LINES)
    .map((reply) => `- клиентка написала ${toKyivTime(reply.clientMessageAt.toISOString())} → ответил(а) ${reply.managerName} в ${toKyivTime(reply.repliedAt.toISOString())} (${Math.round(reply.minutes)} мин)`);

  const body = lines.length > 0 ? lines.join('\n') : '- ответов менеджеров на сообщения клиентки в этом фрагменте нет';
  return `ОЖИДАНИЕ КЛИЕНТКИ (посчитано кодом, рабочие минуты):\n${body}`;
}
