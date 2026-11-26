import { TelegramOwnerBotService } from '../telegram/telegram-owner-bot.service';
import { TelegramService } from '../telegram/telegram.service';
import { FORCE_PREFIX } from './touch-approval.service';
import { formatMissingMedia, type MissingMedia } from './touch-messages';

const MAX_BUTTONS = 25;
const MAX_LABEL_LENGTH = 40;

type MissingMediaReport = { missing: MissingMedia; telegramService: TelegramService; ownerBot: TelegramOwnerBotService };

/**
 * The one message about what the bot could not or would not do. Under every client it skipped goes a "touch anyway"
 * button of its own row (owner, 2026-11-26); without skipped clients it is plain text.
 */
export async function sendMissingMediaReport(params: MissingMediaReport): Promise<void> {
  const text = formatMissingMedia(params.missing);
  if (params.missing.skipped.length === 0) return params.telegramService.sendOwnerMessage(text);

  const rows = params.missing.skipped.slice(0, MAX_BUTTONS).map((chat) => [
    { label: `Всё равно коснуться: ${chat.clientName}`.slice(0, MAX_LABEL_LENGTH), data: `${FORCE_PREFIX}${chat.attemptId}` },
  ]);
  await params.ownerBot.sendWithButtons({ text, rows });
}
