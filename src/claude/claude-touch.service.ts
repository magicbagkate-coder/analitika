import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';
import { formatTranscript } from './transcript-formatter';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const TOUCH_TOOL_NAME = 'submit_touch_texts';
const MAX_TEXT_LENGTH = 450;
const TRANSCRIPT_MESSAGES = 30;

export type TouchTexts = { messageText: string };

export type WriteTouchTextsParams = { clientName: string; messagesNewestFirst: ChatMessage[] };

/**
 * The one message that follows a touch video (owner, 2026-11-25): a warm line, a general compliment of the bag and a
 * soft closing question, all in one text. There is no catalog, so the line may use only what the chat itself says.
 */
@Injectable()
export class ClaudeTouchService {
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async writeTouchTexts(params: WriteTouchTextsParams): Promise<TouchTexts> {
    const recent = params.messagesNewestFirst.slice(0, TRANSCRIPT_MESSAGES);
    const response = await withHardTimeout(
      this.client.messages.create({
        model: this.appConfig.getAnthropicModel(),
        max_tokens: 600,
        tools: [this.buildTool()],
        tool_choice: { type: 'tool', name: TOUCH_TOOL_NAME },
        messages: [{ role: 'user', content: this.buildPrompt({ clientName: params.clientName, transcript: formatTranscript(recent) }) }],
      }),
      'ClaudeTouchService.writeTouchTexts',
    );
    return this.extractTexts(response);
  }

  private buildPrompt(params: { clientName: string; transcript: string }): string {
    return [
      'Ти пишеш повторне "дотичне" повідомлення клієнтці магазину сумок MagicBag від імені менеджерки (жіночий рід).',
      'Клієнтка мовчить після розмови з менеджером; їй щойно надіслали відео сумки. Потрібне ОДНЕ повідомлення, яке піде',
      'одразу після відео: тепла фраза, коротка щира похвала сумочки і м\x27яке закрите запитання в кінці — усе разом, в одному тексті.',
      'Починай так: "Знайшла для Вас чудовий відеоогляд цієї сумочки".',
      'Далі похвала: класна, чудова, дуже стильна, прекрасна, супер, чудово виглядає наживо — добирай слова по-різному, не повторюй',
      'щоразу одне й те саме. Хвали лише загальними словами. Конкретні факти (матеріал, колір, розмір, ціна, наявність) НЕ',
      'вигадуй: можна згадати лише те, що вже сказано в переписці (наприклад, назву чи колір). Жодних знижок і акцій: магазин їх не робить.',
      'Закінчуй одним м\x27яким запитанням. Зразок: "Чи хотіли б Ви обрати її для себе? Якщо так, допоможу з оформленням замовлення". Ніколи',
      'не пропонуй "надіслати ще фото" і не тисни.',
      'Мова — ЗАВЖДИ ТІЛЬКИ УКРАЇНСЬКА, навіть якщо клієнтка пише російською: жодного російського слова. Звертання на "Ви".',
      'Не більше одного емодзі. Без підпису й без привітання. Усе повідомлення до 350 символів.',
      '',
      `Клієнтка: ${params.clientName}`,
      `ПЕРЕПИСКА:\n${params.transcript}`,
    ].join('\n');
  }

  private buildTool(): Anthropic.Tool {
    return {
      name: TOUCH_TOOL_NAME,
      description: 'Return the one message that follows the touch video.',
      input_schema: {
        type: 'object',
        properties: {
          messageText: { type: 'string', description: 'One message: a warm line, a general compliment of the bag, a soft closing question.' },
        },
        required: ['messageText'],
      },
    };
  }

  /** A forced tool call is not a type guarantee: the message must be a non-empty string of a sane length. */
  private extractTexts(response: Anthropic.Message): TouchTexts {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error(`Claude returned no touch texts (stop_reason: ${response.stop_reason})`);

    const input = toolUse.input as Partial<TouchTexts>;
    const messageText = typeof input.messageText === 'string' ? input.messageText.trim() : '';
    if (messageText.length === 0 || messageText.length > MAX_TEXT_LENGTH) throw new Error('Claude returned an unusable touch message');
    return { messageText };
  }
}
