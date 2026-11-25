import { buildChatUrl } from '../chat-links/chat-link-render';
import { escapeHtml } from '../telegram/telegram-format';
import type { TouchPlan } from '../touch-log/touch-log.types';

type ChatRef = { chatId: string; clientName: string };

function chatLine(chat: ChatRef): string {
  return `<a href="${buildChatUrl(chat.chatId)}">${escapeHtml(chat.clientName)}</a>`;
}

function planLines(plan: TouchPlan): string[] {
  return [`1️⃣ 🎬 Видео: ${escapeHtml(plan.videoFileName)}`, `2️⃣ ${escapeHtml(plan.messageText)}`];
}

/** The owner approves each of the first touches by hand: this is what she sees above the two buttons. */
export function formatApprovalRequest(params: ChatRef & { plan: TouchPlan; status: string }): string {
  return ['📨<b>Касание — отправить?</b>', `Клиент: ${chatLine(params)} (статус «${escapeHtml(params.status)}»)`, ...planLines(params.plan)].join('\n');
}

/** Dry-run: the same picture, but nothing will be sent. */
export function formatDryRunTouch(params: ChatRef & { plan: TouchPlan }): string {
  return ['🧪<b>Проба: касание ушло бы так</b>', `Клиент: ${chatLine(params)}`, ...planLines(params.plan), 'Ничего не отправлено.'].join('\n');
}

export type MissingVideoChat = ChatRef & { article: string };
export type MissingMedia = { noArticle: ChatRef[]; noVideo: MissingVideoChat[] };

const MAX_LISTED_CHATS = 25;
const NEW_LINE = '\n';

function listChats(lines: string[]): string[] {
  const shown = lines.slice(0, MAX_LISTED_CHATS);
  return lines.length > MAX_LISTED_CHATS ? [...shown, `…и ещё ${lines.length - MAX_LISTED_CHATS}`] : shown;
}

/**
 * One message per check, not one per chat: managers will not write the article from the first day, and a
 * message for every chat would bury the owner. Each chat is named once, then not again.
 */
export function formatMissingMedia(missing: MissingMedia): string {
  const noArticle = listChats(missing.noArticle.map((chat) => `• ${chatLine(chat)}`));
  const noVideo = listChats(missing.noVideo.map((chat) => `• ${chatLine(chat)} — артикул <b>${escapeHtml(chat.article)}</b>`));
  const sections = [
    noArticle.length > 0 ? ['📝<b>Касание пора делать, но нет артикула в заметке:</b>', ...noArticle].join(NEW_LINE) : '',
    noVideo.length > 0 ? ['🎞<b>Артикул есть, видео в папке нет — загрузите:</b>', ...noVideo].join(NEW_LINE) : '',
  ];
  return sections.filter((section) => section.length > 0).join(NEW_LINE + NEW_LINE);
}

/** After a send that may or may not have arrived: the owner must look, the bot never resends. */
export function formatSendTrouble(params: ChatRef & { step: string; outcome: string; detail: string }): string {
  const verdict = params.outcome === 'rejected' ? 'Sitniks отказал, клиент ничего не получил.' : 'Неизвестно, дошло ли. Бот НЕ будет отправлять повторно.';
  return `⚠️<b>Проблема с касанием</b>\nКлиент: ${chatLine(params)}\nШаг: ${escapeHtml(params.step)} (ответ: ${escapeHtml(params.detail)})\n${verdict} Проверьте чат.`;
}

export function formatTouchSent(params: ChatRef & { videoFileName: string }): string {
  return `✅ Касание отправлено: ${chatLine(params)}, видео ${escapeHtml(params.videoFileName)}`;
}

export type MorningSummary = { closed: number; touched: number; failed: number; dryRun: boolean };

export function formatMorningSummary(summary: MorningSummary): string {
  const title = summary.dryRun ? '🧪<b>Проба утреннего разбора (ничего не менялось)</b>' : '🌅<b>Утренний разбор</b>';
  const verb = summary.dryRun ? 'закрыл бы' : 'закрыто';
  return [title, `${verb}: ${summary.closed}`, `касаний вчерашним чатам: ${summary.touched}`, `ошибок: ${summary.failed}`].join('\n');
}

export function formatTouchError(message: string): string {
  return `⚠️<b>Касания: ошибка</b>\n${escapeHtml(message)}`;
}
