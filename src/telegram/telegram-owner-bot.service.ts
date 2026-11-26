import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { TelegramService } from './telegram.service';

const POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 30_000;
// A typed "ок" that waited in Telegram while the app was down must not approve something later.
const STALE_TEXT_SECONDS = 10 * 60;

export type OwnerButton = { label: string; data: string };
export type ButtonPress = { data: string; messageId: number };

export type OwnerBotHandlers = {
  /** Returns the short answer shown on the pressed button. */
  onButton: (press: ButtonPress) => Promise<string>;
  /** Returns a reply to send back, or null to stay silent. */
  onText: (text: string) => Promise<string | null>;
};

type InlineButton = { text: string; callback_data?: string };

type TelegramUpdate = {
  update_id: number;
  message?: { chat: { id: number }; text?: string; date: number };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number }; reply_markup?: { inline_keyboard?: InlineButton[][] } } };
};

type TelegramReply<Result> = { ok: boolean; result: Result };

/**
 * The owner's private chat with the bot as a two-way channel: messages with buttons out, button presses and
 * a typed "ок" back. Only the owner's own chat is ever listened to — anything from a group or a stranger is
 * dropped — and polling starts only when the touch bot is switched on, so with the bot off nothing changes.
 */
@Injectable()
export class TelegramOwnerBotService {
  private readonly logger = new Logger(TelegramOwnerBotService.name);
  private readonly startedAtSeconds = Math.floor(Date.now() / 1000);
  private nextOffset: number | undefined;
  private polling = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly appConfig: AppConfigService,
    private readonly telegramService: TelegramService,
  ) {}

  /** One inner list per row of buttons. Returns the Telegram message id, which the approval later refers to. */
  async sendWithButtons(params: { text: string; rows: OwnerButton[][] }): Promise<number> {
    const replyMarkup = { inline_keyboard: params.rows.map((row) => row.map((button) => ({ text: button.label, callback_data: button.data }))) };
    const body = { chat_id: this.appConfig.getTelegramOwnerChatId(), text: params.text, parse_mode: 'HTML', reply_markup: replyMarkup };
    const reply = await this.call<{ message_id: number }>('sendMessage', body);
    return reply.message_id;
  }

  startPolling(handlers: OwnerBotHandlers): void {
    setInterval(() => {
      this.pollOnce(handlers).catch((error) => this.logger.warn(`Owner bot poll failed: ${(error as Error).message}`));
    }, POLL_INTERVAL_MS);
  }

  private async pollOnce(handlers: OwnerBotHandlers): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const updates = await this.call<TelegramUpdate[]>('getUpdates', { offset: this.nextOffset, timeout: 0, allowed_updates: ['message', 'callback_query'] });
      for (const update of updates) {
        this.nextOffset = update.update_id + 1;
        await this.tryHandleUpdate({ update, handlers });
      }
    } finally {
      this.polling = false;
    }
  }

  private async tryHandleUpdate(params: { update: TelegramUpdate; handlers: OwnerBotHandlers }): Promise<void> {
    try {
      await this.handleUpdate(params);
    } catch (error) {
      this.logger.warn(`Could not handle an owner bot update: ${(error as Error).message}`);
    }
  }

  private async handleUpdate(params: { update: TelegramUpdate; handlers: OwnerBotHandlers }): Promise<void> {
    const ownerChatId = this.appConfig.getTelegramOwnerChatId();
    const { message, callback_query: callback } = params.update;

    if (callback?.data && callback.message && String(callback.message.chat.id) === ownerChatId) {
      const answer = await params.handlers.onButton({ data: callback.data, messageId: callback.message.message_id });
      await this.call('answerCallbackQuery', { callback_query_id: callback.id, text: answer });
      // Only the row of the pressed button goes: an approval is one row (both buttons leave), a list keeps its other rows.
      const remaining = (callback.message.reply_markup?.inline_keyboard ?? []).filter((row) => !row.some((button) => button.callback_data === callback.data));
      await this.call('editMessageReplyMarkup', { chat_id: ownerChatId, message_id: callback.message.message_id, reply_markup: { inline_keyboard: remaining } });
      return;
    }

    const isFresh = message !== undefined && message.date >= this.startedAtSeconds - STALE_TEXT_SECONDS;
    if (message?.text && isFresh && String(message.chat.id) === ownerChatId) {
      const reply = await params.handlers.onText(message.text);
      if (reply) await this.telegramService.sendOwnerMessage(reply);
    }
  }

  private async call<Result>(method: string, body: object): Promise<Result> {
    const url = `https://api.telegram.org/bot${this.appConfig.getTelegramBotToken()}/${method}`;
    const response = await firstValueFrom(this.httpService.post<TelegramReply<Result>>(url, body, { timeout: REQUEST_TIMEOUT_MS }));
    return response.data.result;
  }
}
