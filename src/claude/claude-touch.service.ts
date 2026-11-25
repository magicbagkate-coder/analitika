import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';
import { formatTranscript } from './transcript-formatter';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const TOUCH_TOOL_NAME = 'submit_touch_texts';
const MAX_TEXT_LENGTH = 300;
const TRANSCRIPT_MESSAGES = 30;

export type TouchTexts = { descriptionText: string; questionText: string };

export type WriteTouchTextsParams = { clientName: string; messagesNewestFirst: ChatMessage[] };

/**
 * The two short texts that follow a touch video (owner, 2026-11-20): one line about the model, then one soft
 * closing question. There is no catalog, so the line may use only what the chat itself says.
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
      'Ти пишеш повторне "дотичне" повідомлення клієнтці магазину сумок MagicBag від імені менеджера. Клієнтка',
      'мовчить після розмови з менеджером; їй щойно надіслали відео сумки. Потрібні ДВА короткі тексти, які підуть після відео:',
      '1. descriptionText — тепла фраза до відео від імені менеджерки (жіночий рід). Починай так: "Знайшла, відправляю',
      'Вам відеоогляд цієї моделі" (російською: "Нашла, отправляю Вам видеообзор этой модели"), і одразу коротка щира',
      'похвала сумочки: чудова, дуже стильна, прекрасна, суперська — добирай слова по-різному, не повторюй щоразу одне й',
      'те саме. Хвали лише загальними словами. Конкретні факти (матеріал, колір, розмір, ціна, наявність) НЕ вигадуй: можна',
      'згадати лише те, що вже сказано в переписці (наприклад, назву чи колір). Жодних знижок і акцій: магазин їх не робить.',
      '2. questionText — одне м\'яке закрите запитання. Зразок: "Чи хотіли б Ви обрати цю модель? Якщо так, допоможу з',
      'оформленням". Ніколи не пропонуй "надіслати ще фото" і не тисни.',
      'Мова — та, якою пише клієнтка (українська, якщо не зрозуміло; російська, якщо вона пише російською). Звертання на',
      '"Ви". Не більше одного емодзі в обох текстах разом. Без підпису й без привітання. Кожен текст до 200 символів.',
      '',
      `Клієнтка: ${params.clientName}`,
      `ПЕРЕПИСКА:\n${params.transcript}`,
    ].join('\n');
  }

  private buildTool(): Anthropic.Tool {
    return {
      name: TOUCH_TOOL_NAME,
      description: 'Return the two short texts that follow the touch video.',
      input_schema: {
        type: 'object',
        properties: {
          descriptionText: { type: 'string', description: 'One short line about the model, only from facts in the chat.' },
          questionText: { type: 'string', description: 'One soft closing question.' },
        },
        required: ['descriptionText', 'questionText'],
      },
    };
  }

  /** A forced tool call is not a type guarantee: both texts must be non-empty strings of a sane length. */
  private extractTexts(response: Anthropic.Message): TouchTexts {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error(`Claude returned no touch texts (stop_reason: ${response.stop_reason})`);

    const input = toolUse.input as Partial<TouchTexts>;
    const texts = [input.descriptionText, input.questionText].map((text) => (typeof text === 'string' ? text.trim() : ''));
    if (texts.some((text) => text.length === 0 || text.length > MAX_TEXT_LENGTH)) throw new Error('Claude returned unusable touch texts');
    return { descriptionText: texts[0], questionText: texts[1] };
  }
}
