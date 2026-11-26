import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';
import { formatTranscript } from './transcript-formatter';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const TOUCH_TOOL_NAME = 'submit_touch_decision';
const MAX_TEXT_LENGTH = 450;
const MAX_REASON_LENGTH = 160;
const TRANSCRIPT_MESSAGES = 30;
// Several articles in one note mean several videos (owner, 2026-11-26): the message must talk about variants, not one bag.
const MANY_VIDEOS_RULE =
  'Надіслано {count} відео — це кілька варіантів сумочок. Пиши про варіанти: починай "Знайшла для Вас кілька чудових варіантів — ' +
  'відправляю відеоогляди", похвали їх загалом, а запитання зроби про вибір: "Який варіант Вам сподобався найбільше? Допоможу з ' +
  'оформленням замовлення". Не пиши "ця сумочка" в однині.';

/** shouldTouch false means the dialog itself says a touch is out of place; `skipReason` is for the owner, in Russian. */
export type TouchTexts = { shouldTouch: boolean; skipReason: string; messageText: string };

export type WriteTouchTextsParams = { clientName: string; messagesNewestFirst: ChatMessage[]; videoCount: number };

/**
 * Reads the dialog and decides, as the owner asked (2026-11-26), whether a touch fits at all; if it does, writes the
 * one message that follows the video (owner, 2026-11-25): a warm line, a general compliment of the bag and a soft
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
        max_tokens: 700,
        tools: [this.buildTool()],
        tool_choice: { type: 'tool', name: TOUCH_TOOL_NAME },
        messages: [{ role: 'user', content: this.buildPrompt({ clientName: params.clientName, transcript: formatTranscript(recent), videoCount: params.videoCount }) }],
      }),
      'ClaudeTouchService.writeTouchTexts',
    );
    return this.extractTexts(response);
  }

  private buildPrompt(params: { clientName: string; transcript: string; videoCount: number }): string {
    return [
      'Ти готуєш повторне "дотичне" повідомлення клієнтці магазину сумок MagicBag від імені менеджерки (жіночий рід).',
      'Клієнтка мовчить після розмови з менеджером; їй ось-ось надішлють відео сумки.',
      '',
      'КРОК 1. Вирішуй, чи доречне це повідомлення взагалі. НЕ торкайся (shouldTouch=false) ЛИШЕ коли з переписки ЯСНО видно одне з:',
      '— клієнтка відмовилась остаточно або не цікавиться ("не потрібно", "не цікаво", "передумала", "не буду");',
      '— просила більше не писати;',
      '— вже купила, оплатила або оформила замовлення (у нас чи деінде);',
      '— попросила написати пізніше у конкретний час чи день, і він ще не настав;',
      '— це скарга чи конфлікт;',
      '— розмова зовсім не про вибір сумки (обмін, повернення, доставка вже оформленого замовлення);',
      '— ГОЛОВНЕ заперечення клієнтки — ціна: пише "дорого", питає про знижку, акцію чи розстрочку. Магазин знижок не робить, і',
      ' стандартне повідомлення про сумку тут не підходить — це для менеджера (skipReason почни зі слів "цена/скидка:");',
      '— клієнтка поставила конкретне запитання (розмір, заміри, матеріал, наявність, доставка), а менеджерка на нього ще не',
      ' відповіла (skipReason почни зі слів "нужен ответ менеджера:").',
      'Якщо сумніваєшся — торкайся (shouldTouch=true). У skipReason напиши ОДНУ коротку фразу РОСІЙСЬКОЮ для власниці магазину:',
      'що саме сказала клієнтка (можна з короткою цитатою). Якщо торкаємось, skipReason залиш порожнім.',
      '',
      'КРОК 2 (лише якщо торкаємось). Напиши ОДНЕ повідомлення, яке піде одразу після відео.',
      'ЗВИЧАЙНИЙ тон: тепла фраза, коротка щира похвала сумочки і м\x27яке закрите запитання в кінці — усе разом, в одному тексті.',
      'Починай так: "Знайшла для Вас чудовий відеоогляд цієї сумочки". Закінчуй одним м\x27яким запитанням. Зразок: "Чи хотіли б Ви',
      'обрати її для себе? Якщо так, допоможу з оформленням замовлення".',
      'ДУЖЕ М\x27ЯКИЙ тон — коли клієнтка відповіла "поки ні", "поки все", "подумаю", "поки не готова" (не остаточна відмова): без запитання',
      'про замовлення і без тиску. Зразок: "Знайшла для Вас відеоогляд цієї сумочки 🤍 Раптом буде цікаво — подивіться, коли буде зручно. Якщо',
      'виникнуть запитання, я на зв\x27язку".',
      'НІЯКИХ ВИГАДАНИХ ДЕТАЛЕЙ. У повідомленні не має бути жодних ознак сумки: ні матеріалу (шкіра, замша), ні кольору, ні розміру, ні форми,',
      'ні країни виробництва, ні ціни, ні наявності, ні особливостей — навіть якщо тобі здається очевидним. Єдиний виняток: слово, яке',
      'ПРЯМО написала клієнтка або менеджерка в переписці, і лише коли воно потрібне (наприклад, колір у запитанні). Хвали ЛИШЕ загальними',
      'словами: стильна, елегантна, чудова, класна, супер. Не згадуй особисті обставини клієнтки (донька, подарунок, бюджет, робота).',
      'Жодних знижок і акцій: магазин їх не робить. Ніколи не пропонуй "надіслати ще фото" і не тисни.',
      'Мова повідомлення — ЗАВЖДИ ТІЛЬКИ УКРАЇНСЬКА, навіть якщо клієнтка пише російською: жодного російського слова. Звертання на "Ви".',
      'Не більше одного емодзі. Без підпису й без привітання. Усе повідомлення до 350 символів.',
      '',
      params.videoCount > 1 ? MANY_VIDEOS_RULE.replace('{count}', String(params.videoCount)) : 'Надіслано одне відео — пиши про одну сумочку.',
      '',
      `Клієнтка: ${params.clientName}`,
      `ПЕРЕПИСКА:\n${params.transcript}`,
    ].join('\n');
  }

  private buildTool(): Anthropic.Tool {
    return {
      name: TOUCH_TOOL_NAME,
      description: 'Decide whether a touch fits this dialog and, if it does, write the one message that follows the video.',
      input_schema: {
        type: 'object',
        properties: {
          shouldTouch: { type: 'boolean', description: 'false only when the dialog clearly shows a touch is out of place.' },
          skipReason: { type: 'string', description: 'In Russian, for the owner: why not (empty when shouldTouch is true).' },
          messageText: { type: 'string', description: 'In Ukrainian: a warm line, a general compliment, a soft closing question (empty when shouldTouch is false).' },
        },
        required: ['shouldTouch', 'skipReason', 'messageText'],
      },
    };
  }

  /**
   * A forced tool call is not a type guarantee. A touch needs a usable message of a sane length; a skip needs a
   * reason, or the owner could not check the decision.
   */
  private extractTexts(response: Anthropic.Message): TouchTexts {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error(`Claude returned no touch decision (stop_reason: ${response.stop_reason})`);

    const input = toolUse.input as Partial<TouchTexts>;
    const messageText = typeof input.messageText === 'string' ? input.messageText.trim() : '';
    const skipReason = typeof input.skipReason === 'string' ? input.skipReason.trim().slice(0, MAX_REASON_LENGTH) : '';
    if (input.shouldTouch === false && skipReason.length > 0) return { shouldTouch: false, skipReason, messageText: '' };
    if (input.shouldTouch === true && messageText.length > 0 && messageText.length <= MAX_TEXT_LENGTH) return { shouldTouch: true, skipReason: '', messageText };
    throw new Error('Claude returned an unusable touch decision');
  }
}
