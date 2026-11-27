import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';
import { formatTranscript } from './transcript-formatter';
import { findBannedWord, findCopiedPhrase, findUnknownProduct } from './touch-copy-check';
import { findUnprovenDetails, type UsedDetail } from './touch-message-check';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const TOUCH_TOOL_NAME = 'submit_touch_decision';
const MAX_TEXT_LENGTH = 450;
const MAX_REASON_LENGTH = 160;
const TRANSCRIPT_MESSAGES = 30;
// Several articles in one note mean several videos (owner, 2026-11-26): the message must talk about variants, not one bag.
const MANY_VIDEOS_RULE =
  'Надіслано {count} відео — це кілька варіантів сумочок. Пиши про варіанти: починай "Знайшла для Вас кілька чудових варіантів — ' +
  'відправляю відеоогляди", похвали їх загалом, а запитання зроби про вибір: "Який варіант Вам сподобався найбільше? Допоможу з ' +
  'оформленням замовлення". Не пиши "ця сумка" в однині.';

// Sent instead of a message whose bag details the dialog does not prove: no detail at all, only general praise.
const PLAIN_MESSAGE_ONE = 'Знайшла для Вас чудовий відеоогляд цієї моделі 🤍 Вона дуже стильна та елегантна. Чи хотіли б Ви обрати її для себе? Якщо так, допоможу з оформленням замовлення';
const PLAIN_MESSAGE_MANY = 'Знайшла для Вас кілька чудових варіантів — відправляю відеоогляди 🤍 Які ж вони стильні! Який варіант Вам сподобався найбільше? Допоможу з оформленням замовлення';

// The owner pressed "touch anyway": step 1 is settled, and a price or a pending question must not make the text clumsy.
const FORCED_TOUCH_RULE =
  'ВЛАСНИЦЯ ВЖЕ ВИРІШИЛА: торкатися ОБОВ\x27ЯЗКОВО. Став shouldTouch=true і одразу пиши повідомлення. Якщо головне питання клієнтки було про ціну чи ' +
  'знижку — не згадуй ні ціну, ні знижки; якщо клієнтка ще не відповіла на запитання менеджерки — ніжно, без тиску.';

/** shouldTouch false means the dialog itself says a touch is out of place; `skipReason` is for the owner, in Russian. */
export type TouchTexts = { shouldTouch: boolean; skipReason: string; messageText: string; usedDetails?: UsedDetail[] };

export type StyleExample = { original: string; corrected: string };

export type WriteTouchTextsParams = {
  clientName: string;
  messagesNewestFirst: ChatMessage[];
  videoCount: number;
  /** The owner decided to touch this client whatever the dialog says (the "touch anyway" choice). */
  forceTouch?: boolean;
  /** Her recent corrections of the bot's messages: what the bot wrote and what she made of it. */
  examples?: StyleExample[];
  /** Messages of the newest touches already sent to other clients: the new one must sound different. */
  recentTexts?: string[];
};

/**
 * Reads the dialog and decides, as the owner asked (2026-11-26), whether a touch fits at all; if it does, writes the
 * one message that follows the video (owner, 2026-11-25): a warm line, a general compliment of the bag and a soft
 * closing question. There is no catalog, so the line may use only what the chat itself says.
 */
@Injectable()
export class ClaudeTouchService {
  private readonly logger = new Logger(ClaudeTouchService.name);
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async writeTouchTexts(params: WriteTouchTextsParams): Promise<TouchTexts> {
    const recent = params.messagesNewestFirst.slice(0, TRANSCRIPT_MESSAGES);
    const transcript = formatTranscript(recent);
    const prompt = this.buildPrompt({ clientName: params.clientName, transcript, videoCount: params.videoCount, forceTouch: params.forceTouch === true, examples: params.examples ?? [], recentTexts: params.recentTexts ?? [] });
    const written = await this.writeWithoutCopying({ prompt, transcript, videoCount: params.videoCount });
    // Forced touch: a "no" from the model must not stop it — the plain message goes out instead.
    const decided = params.forceTouch && !written.shouldTouch ? { shouldTouch: true, skipReason: '', messageText: params.videoCount > 1 ? PLAIN_MESSAGE_MANY : PLAIN_MESSAGE_ONE } : written;
    return this.proveDetails({ texts: decided, transcript, videoCount: params.videoCount });
  }

  private async askWriter(prompt: string): Promise<TouchTexts> {
    const response = await withHardTimeout(
      this.client.messages.create({
        model: this.appConfig.getAnthropicModel(),
        max_tokens: 700,
        tools: [this.buildTool()],
        tool_choice: { type: 'tool', name: TOUCH_TOOL_NAME },
        messages: [{ role: 'user', content: prompt }],
      }),
      'ClaudeTouchService.writeTouchTexts',
    );
    return this.extractTexts(response);
  }

  /** The manager's own description of the bag must not come back in the touch (owner, 2026-11-27): one rewrite, then the plain message. */
  private async writeWithoutCopying(params: { prompt: string; transcript: string; videoCount: number }): Promise<TouchTexts> {
    const first = await this.askWriter(params.prompt);
    const fault = first.shouldTouch ? this.findFault({ texts: first, transcript: params.transcript }) : null;
    if (fault === null) return first;

    const second = await this.askWriter(`${params.prompt}\n\nУВАГА: у твоїй попередній версії ${fault}. Напиши повідомлення ЗАНОВО: своїми словами, без фраз менеджерки, без пестливих слів (кажи "сумка", "модель") і без слова "виглядає".`);
    if (!second.shouldTouch || this.findFault({ texts: second, transcript: params.transcript }) === null) return second;
    this.logger.warn(`Touch message still has a fault (${fault}), sending the plain one`);
    return { shouldTouch: true, skipReason: '', messageText: params.videoCount > 1 ? PLAIN_MESSAGE_MANY : PLAIN_MESSAGE_ONE };
  }

  /** What is wrong with a written message, in words for the writer: a phrase copied from the dialog, or a diminutive. */
  private findFault(params: { texts: TouchTexts; transcript: string }): string | null {
    const copied = findCopiedPhrase({ messageText: params.texts.messageText, transcript: params.transcript });
    if (copied !== null) return `була дослівна фраза з переписки: "${copied}"`;
    const banned = findBannedWord(params.texts.messageText);
    if (banned !== null) return `було заборонене слово "${banned}"`;
    const product = findUnknownProduct({ messageText: params.texts.messageText, transcript: params.transcript });
    return product === null ? null : `виріб названо "${product}", а в переписці його так не називають (дивись, як його називає менеджерка; якщо незрозуміло — "цієї моделі")`;
  }

  /** Bag details in the message must be proven by the dialog; otherwise the plain message goes out instead. */
  private proveDetails(params: { texts: TouchTexts; transcript: string; videoCount: number }): TouchTexts {
    const { texts } = params;
    if (!texts.shouldTouch) return texts;

    const unproven = findUnprovenDetails({ messageText: texts.messageText, transcript: params.transcript, usedDetails: texts.usedDetails ?? [] });
    if (unproven.length === 0) return texts;
    this.logger.warn(`Touch message had details the dialog does not prove (${unproven.join(', ')}), sending the plain one`);
    return { shouldTouch: true, skipReason: '', messageText: params.videoCount > 1 ? PLAIN_MESSAGE_MANY : PLAIN_MESSAGE_ONE };
  }

  private buildPrompt(params: { clientName: string; transcript: string; videoCount: number; forceTouch: boolean; examples: StyleExample[]; recentTexts: string[] }): string {
    return [
      'Ти готуєш повторне "дотичне" повідомлення клієнтці магазину сумок MagicBag від імені менеджерки (жіночий рід).',
      'Клієнтка мовчить після розмови з менеджером; їй ось-ось надішлють відео сумки.',
      '',
      params.forceTouch ? FORCED_TOUCH_RULE : '',
      'КРОК 1. Вирішуй, чи доречне це повідомлення взагалі. НЕ торкайся (shouldTouch=false) ЛИШЕ коли з переписки ЯСНО видно одне з:',
      '— клієнтка відмовилась остаточно або не цікавиться ("не потрібно", "не цікаво", "передумала", "не буду");',
      '— просила більше не писати;',
      '— вже купила, оплатила або оформила замовлення (у нас чи деінде);',
      '— попросила написати пізніше у конкретний час чи день, і він ще не настав;',
      '— це скарга чи конфлікт;',
      '— розмова зовсім не про вибір сумки (обмін, повернення, доставка вже оформленого замовлення);',
      '— ОСТАННЄ заперечення клієнтки — ціна: її останні 1-3 повідомлення про "дорого", знижку, акцію чи розстрочку. Магазин знижок не',
      ' робить, і стандартне повідомлення про сумку тут не підходить — це для менеджера (skipReason почни зі слів "цена/скидка:"). Якщо про',
      ' ціну говорили раніше, а потім розмова пішла далі (клієнтка вибирає модель чи колір) — це НЕ причина пропускати;',
      '— КЛІЄНТКА поставила конкретне запитання (розмір, заміри, матеріал, наявність, доставка), а МЕНЕДЖЕРКА на нього ще не відповіла',
      ' (skipReason почни зі слів "нужен ответ менеджера:"). УВАГА: коли запитання поставила МЕНЕДЖЕРКА, а клієнтка мовчить — це',
      ' НОРМАЛЬНА ситуація для дотику і НЕ причина пропускати.',
      'Якщо сумніваєшся — торкайся (shouldTouch=true). У skipReason напиши ОДНУ коротку фразу РОСІЙСЬКОЮ для власниці магазину:',
      'що саме сказала клієнтка (можна з короткою цитатою). Якщо торкаємось, skipReason залиш порожнім.',
      '',
      'КРОК 2 (лише якщо торкаємось). Напиши ОДНЕ повідомлення, яке піде одразу після відео.',
      'ЗВИЧАЙНИЙ тон: тепла фраза, коротка щира похвала сумки і м\x27яке закрите запитання в кінці — усе разом, в одному тексті.',
      'Починай так: "Знайшла для Вас чудовий відеоогляд" і назва виробу ТАК, ЯК ЙОГО НАЗИВАЮТЬ У ПЕРЕПИСЦІ: сумка — "цієї сумки", рюкзак — "цього рюкзака",',
      'гаманець — "цього гаманця", клатч — "цього клатча". Якщо не зрозуміло, що це — "цієї моделі". Рюкзак НІКОЛИ не називай сумкою.',
      ' Закінчуй одним м\x27яким запитанням. Зразок: "Чи хотіли б Ви',
      'обрати її для себе? Якщо так, допоможу з оформленням замовлення".',
      'КЛІЄНТКА СКАЗАЛА "подумаю" ("дякую, подумаю", "я подумаю"): після "Знайшла для Вас чудовий відеоогляд (виріб — як вище) 🤍" став ОДНЕ запитання:',
      '"Чи вдалося Вам визначитися з вибором?" (слова навколо можна трохи змінити). Без "хотіли б обрати" і без "допоможу з оформленням".',
      'ДУЖЕ М\x27ЯКИЙ тон — коли клієнтка відповіла "поки ні", "поки все", "поки не готова" (не остаточна відмова): без запитання',
      'про замовлення і без тиску. Зразок: "Знайшла для Вас відеоогляд (виріб — як вище) 🤍 Раптом буде цікаво — подивіться, коли буде зручно. Якщо',
      'виникнуть запитання, я на зв\x27язку".',
      'ДЕТАЛІ ЛИШЕ З ПЕРЕПИСКИ. Можна згадати особливість сумки (матеріал, шкіра чи замша, колір, розмір, країну, форму), АЛЕ ТІЛЬКИ ту, яку',
      'менеджерка або клієнтка ПРЯМО написали вище в діалозі саме про ту модель, яку клієнтка зараз розглядає (наприклад, менеджерка',
      'написала "італійська шкіра" — можна згадати італійську шкіру). Дивись по контексту. Якщо в діалозі про це не було сказано, або незрозуміло, чи',
      'це про ту саму модель (в розмові їх може бути кілька) — НЕ згадуй, нічого не додумуй і не вгадуй. Нічого, чого не було в переписці:',
      'ні матеріалу, ні кольору, ні розміру, ні країни, ні ціни, ні наявності. Решту хвали ЛИШЕ загальними словами: стильна, елегантна, чудова,',
      'класна, супер. Не згадуй особисті обставини клієнтки (донька, подарунок, бюджет, робота), якщо вона сама про це не писала.',
      'У полі usedDetails перелічи КОЖНУ особливість сумки, яку ти згадав у повідомленні, з ДОСЛІВНОЮ цитатою з переписки, де про це сказано.',
      'Якщо особливостей у повідомленні немає — usedDetails порожній масив.',
      'Жодних знижок і акцій: магазин їх не робить. Ніколи не пропонуй "надіслати ще фото" і не тисни.',
      'Мова повідомлення — ЗАВЖДИ ТІЛЬКИ УКРАЇНСЬКА, навіть якщо клієнтка пише російською: жодного російського слова. Звертання на "Ви".',
      'ЖОДНИХ ЗМЕНШЕНО-ПЕСТЛИВИХ СЛІВ (власниця, 2026-11-27): не "сумочка", "моделька", "рюкзачок" — а "сумка", "модель", "рюкзак".',
      'НЕ ПИШИ "виглядає" (власниця, 2026-11-27): не "виглядає дуже якісно", а прямо — "вона якісна". Не вигадуй відчуттів і властивостей',
      '("приємна на дотик", "м\x27яка", "щільна"), якщо їх немає в переписці.',
      'НЕ КОПІЮЙ МЕНЕДЖЕРКУ. Не бери готових фраз з її опису сумки (на кшталт "елегантна шкіряна сумка — чудове поєднання комфорту, стилю та',
      'практичності"): клієнтка це вже читала, і повтор виглядає як лінь. Якщо згадуєш особливість — одним-двома своїми словами, інакше, ніж менеджерка.',
      'КОЖНЕ ПОВІДОМЛЕННЯ ЗВУЧИТЬ ПО-СВОЄМУ. Початок "Знайшла для Вас чудовий відеоогляд ..." можна лишити, а ДАЛІ — нова жива думка,',
      'інші слова й інше закінчення, ніж у вже надісланих іншим клієнткам (список нижче). Тон як у виправленнях власниці: коротко, тепло, по-людськи,',
      'не шаблонно ("створена для вас", "створена щоб вражати", "допомогти з оформленням замовлення?").',
      'Не більше двох емодзі. Без підпису й без привітання. Усе повідомлення до 350 символів.',
      '',
      ...this.buildExamplesBlock(params.examples),
      ...this.buildRecentBlock(params.recentTexts),
      params.videoCount > 1 ? MANY_VIDEOS_RULE.replace('{count}', String(params.videoCount)) : 'Надіслано одне відео — пиши про одну сумку.',
      '',
      `Клієнтка: ${params.clientName}`,
      `ПЕРЕПИСКА:\n${params.transcript}`,
    ].join('\n');
  }

  /** The owner's corrections, newest first: her wording and tone, not a script — and still no details the dialog lacks. */
  private buildExamplesBlock(examples: StyleExample[]): string[] {
    if (examples.length === 0) return [];
    const lines = examples.map((example) => `Було (написав бот): "${example.original}"\nСтало (власниця виправила): "${example.corrected}"`);
    return [
      'ПРИКЛАДИ ВИПРАВЛЕНЬ ВЛАСНИЦІ. Вона переписувала повідомлення бота. Бери з них її слова, тон і довжину, але не копіюй дослівно, якщо ситуація інша,',
      'і не переймай пестливі слова з них ("сумочка"): завжди "сумка", "модель",',
      'і НЕ переноси особливості сумки, яких немає в цій переписці.',
      ...lines,
      '',
    ];
  }

  /** What the other clients just got: the new message must not repeat any of it. */
  private buildRecentBlock(recentTexts: string[]): string[] {
    if (recentTexts.length === 0) return [];
    return ['ВЖЕ НАДІСЛАНО ІНШИМ КЛІЄНТКАМ (не повторюй ці формулювання):', ...recentTexts.map((text) => `— "${text}"`), ''];
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
          usedDetails: {
            type: 'array',
            description: 'Every feature of the bag mentioned in messageText, each with a literal quote from the dialog that states it. Empty if none.',
            items: { type: 'object', properties: { detail: { type: 'string' }, quote: { type: 'string' } }, required: ['detail', 'quote'] },
          },
        },
        required: ['shouldTouch', 'skipReason', 'messageText', 'usedDetails'],
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
    const usedDetails = Array.isArray(input.usedDetails) ? input.usedDetails.filter((used) => typeof used?.detail === 'string' && typeof used?.quote === 'string') : [];
    if (input.shouldTouch === true && messageText.length > 0 && messageText.length <= MAX_TEXT_LENGTH) return { shouldTouch: true, skipReason: '', messageText, usedDetails };
    throw new Error('Claude returned an unusable touch decision');
  }
}
