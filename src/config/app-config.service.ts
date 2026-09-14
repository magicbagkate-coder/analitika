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

  private requireEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) throw new Error(`Missing required env var: ${key}`);
    return value;
  }
}
