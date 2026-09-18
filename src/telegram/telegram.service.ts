import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';

// Telegram's own documented group limit is ~20 messages/minute; 2500ms (24/min) was above that and
// caused frequent 429s during a big run (2026-09-18 — many "rate limit hit" retries in one report,
// each costing 30+s). 3100ms keeps sustained sends under 20/min so retries become the exception.
const MIN_INTERVAL_MS = 3100;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;

type TelegramErrorBody = { parameters?: { retry_after?: number } };

/** Sends plain-text (HTML parse_mode) messages to a Telegram chat, spaced out to respect group rate limits. */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private lastSentAt = 0;

  constructor(
    private readonly httpService: HttpService,
    private readonly appConfig: AppConfigService,
  ) {}

  async sendMessage(text: string): Promise<void> {
    await this.waitForSlot();
    await this.sendWithRetry(text, 0);
  }

  private async sendWithRetry(text: string, attempt: number): Promise<void> {
    const botToken = this.appConfig.getTelegramBotToken();
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = { chat_id: this.appConfig.getTelegramChatId(), text, parse_mode: 'HTML' };

    try {
      await firstValueFrom(this.httpService.post(url, body, { timeout: REQUEST_TIMEOUT_MS }));
      this.lastSentAt = Date.now();
      this.logger.log('Sent Telegram message');
    } catch (error) {
      await this.retryOnRateLimit(error, text, attempt);
    }
  }

  /** Telegram's 429 body carries how long to wait — honor it instead of guessing. */
  private async retryOnRateLimit(error: unknown, text: string, attempt: number): Promise<void> {
    const retryAfterSeconds = axios.isAxiosError<TelegramErrorBody>(error)
      ? error.response?.data?.parameters?.retry_after
      : undefined;
    if (retryAfterSeconds === undefined || attempt >= MAX_RETRIES) throw error;

    this.logger.warn(`Telegram rate limit hit, retrying in ${retryAfterSeconds}s (attempt ${attempt + 1})`);
    await this.delay((retryAfterSeconds + 1) * 1000);
    await this.sendWithRetry(text, attempt + 1);
  }

  private async waitForSlot(): Promise<void> {
    const elapsedMs = Date.now() - this.lastSentAt;
    if (elapsedMs >= MIN_INTERVAL_MS) return;

    await this.delay(MIN_INTERVAL_MS - elapsedMs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
