import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Typed access to environment variables used across the app. */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  getPort(): number {
    return Number(this.configService.get<string>('PORT', '3000'));
  }

  getSitniksApiUrl(): string {
    return this.requireEnv('SITNIKS_API_URL');
  }

  getSitniksApiKey(): string {
    return this.requireEnv('SITNIKS_API_KEY');
  }

  getAnthropicApiKey(): string {
    return this.requireEnv('ANTHROPIC_API_KEY');
  }

  getAnthropicModel(): string {
    return this.configService.get<string>('ANTHROPIC_MODEL', 'claude-sonnet-5');
  }

  getTelegramBotToken(): string {
    return this.requireEnv('TELEGRAM_BOT_TOKEN');
  }

  getTelegramChatId(): string {
    return this.requireEnv('TELEGRAM_CHAT_ID');
  }

  /** The owner's private chat with the bot; falls back to the group so an error is never lost if it is unset. */
  getTelegramOwnerChatId(): string {
    return this.configService.get<string>('TELEGRAM_OWNER_CHAT_ID') || this.getTelegramChatId();
  }

  /**
   * "off" (default): the touch bot does nothing at all. "dry-run": it reads chats and only describes to the
   * owner what it WOULD do. "live": it really sends and closes chats. Owner's rule (2026-11-20): nothing goes
   * to clients until she says «начали», so any other value than "live" or "dry-run" means "off".
   */
  getTouchMode(): 'off' | 'dry-run' | 'live' {
    const mode = this.configService.get<string>('TOUCH_MODE');
    return mode === 'live' || mode === 'dry-run' ? mode : 'off';
  }

  /** The status the touch bot works in; set to the test status to try it without touching real clients. */
  getTouchTargetStatus(): string {
    return this.configService.get<string>('TOUCH_TARGET_STATUS') || 'Вибір товару';
  }

  getTouchClosedStatus(): string {
    return this.configService.get<string>('TOUCH_CLOSED_STATUS') || 'Завершено';
  }

  /** Minutes to wait after the bot first sees the client read a message (60 for real work, 1-2 for a test). */
  getTouchWaitMinutes(): number {
    return Number(this.configService.get<string>('TOUCH_WAIT_MINUTES', '60'));
  }

  getTouchVideoFolderId(): string | null {
    return this.configService.get<string>('TOUCH_VIDEO_FOLDER_ID') || null;
  }

  /** Optional: without both Google settings the spreadsheet export is simply switched off. */
  getGoogleSheetsId(): string | null {
    return this.configService.get<string>('GOOGLE_SHEETS_ID') || null;
  }

  getGoogleKeyFile(): string | null {
    return this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_KEY_FILE') || null;
  }

  getPostgresHost(): string {
    return this.configService.get<string>('POSTGRES_HOST', 'postgres');
  }

  getPostgresPort(): number {
    return Number(this.configService.get<string>('POSTGRES_PORT', '5432'));
  }

  getPostgresUser(): string {
    return this.requireEnv('POSTGRES_USER');
  }

  getPostgresPassword(): string {
    return this.requireEnv('POSTGRES_PASSWORD');
  }

  getPostgresDatabase(): string {
    return this.requireEnv('POSTGRES_DB');
  }

  private requireEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) throw new Error(`Missing required env var: ${key}`);
    return value;
  }
}
