import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';
import { formatTranscript } from './transcript-formatter';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const TRASH_TOOL_NAME = 'submit_trash_story_verdict';
const CATEGORIES = ['претензия', 'повреждение и возврат', 'угроза жалобой', 'абсурдная причина', 'другое'];

export type TrashStoryVerdict = {
  isTrashStory: boolean;
  category: string;
  summary: string;
};

export type AssessTrashStoryParams = {
  clientName: string;
  status: string;
  messages: ChatMessage[];
};

/**
 * Decides whether one chat is a "трэш история" in the owner's sense (2026-11-19): a client complaint,
 * a bag returned damaged (cut, burnt, broken clasp) with the claim that it is not leather, a threat of
 * a complaint to an authority, or an absurd reason to refuse or return. The verdict is built only from
 * the chat text — the same evidence rule as every other report block.
 */
@Injectable()
export class ClaudeTrashStoriesService {
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async assessChat(params: AssessTrashStoryParams): Promise<TrashStoryVerdict> {
    const response = await withHardTimeout(
      this.client.messages.create({
        model: this.appConfig.getAnthropicModel(),
        max_tokens: 1200,
        tools: [this.buildTool()],
        tool_choice: { type: 'tool', name: TRASH_TOOL_NAME },
        messages: [{ role: 'user', content: this.buildPrompt(params) }],
      }),
      'ClaudeTrashStoriesService.assessChat',
    );

    return this.extractVerdict(response);
  }

  private buildPrompt(params: AssessTrashStoryParams): string {
    return [
      `Ниже — переписка магазина сумок MagicBag с клиенткой ${params.clientName}, статус чата в CRM: «${params.status}».`,
      'Владелица собирает «трэш истории» — необычные, абсурдные или неприятные ситуации с клиентками.',
      'К ним относятся:',
      '— любая претензия клиентки (товар, качество, доставка, обслуживание);',
      '— клиентка вернула или хочет вернуть сумку с повреждением (порез, прожжённое дно, сломанная застёжка)',
      'или утверждает, что сумка «не кожаная» / «не та», а следы говорят о её собственных действиях;',
      '— угроза пожаловаться в службу, суд, полицию или публично;',
      '— абсурдная или надуманная причина отказа или возврата (не тот оттенок цвета, «ручки разной длины»,',
      '«матовая фурнитура», требование вернуть всё, включая предоплату).',
      'НЕ трэш история: обычный отказ от покупки, вопрос о цене, доставке, наличии, нормальный возврат без',
      'конфликта, обычное «подумаю». Если есть сомнение — это НЕ трэш история: ложная находка хуже пропущенной.',
      'Опирайся только на ТЕКСТ переписки (фото и видео ты не видишь, они отмечены [фото]/[відео]) и ничего',
      'не додумывай: если из текста не следует, что именно произошло, не заполняй детали.',
      'Если это трэш история — в summary опиши по-русски в 1-3 коротких предложениях: что произошло, чего',
      'требовала клиентка, как ответил менеджер (по имени) и чем закончилось. Если нет — summary пустая строка.',
      '',
      `ПЕРЕПИСКА:\n${formatTranscript(params.messages)}`,
    ].join('\n');
  }

  private buildTool(): Anthropic.Tool {
    return {
      name: TRASH_TOOL_NAME,
      description: 'Return whether the chat is a "трэш история" and, if so, a short factual summary.',
      input_schema: {
        type: 'object',
        properties: {
          isTrashStory: { type: 'boolean' },
          category: { type: 'string', enum: CATEGORIES, description: 'Что именно это за история; если не трэш — "другое".' },
          summary: { type: 'string', description: 'Краткое описание по тексту переписки; пустая строка, если это не трэш история.' },
        },
        required: ['isTrashStory', 'category', 'summary'],
      },
    };
  }

  /** A forced tool call is not a type guarantee — a malformed answer is rejected, never guessed. */
  private extractVerdict(response: Anthropic.Message): TrashStoryVerdict {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude did not return a trash-story verdict');

    const input = toolUse.input as Partial<TrashStoryVerdict>;
    if (typeof input.isTrashStory !== 'boolean') {
      throw new Error(`Claude returned an incomplete trash-story verdict (stop_reason: ${response.stop_reason})`);
    }
    const summary = typeof input.summary === 'string' ? input.summary.trim() : '';
    const category = typeof input.category === 'string' && CATEGORIES.includes(input.category) ? input.category : 'другое';
    return { isTrashStory: input.isTrashStory && summary.length > 0, category, summary };
  }
}
