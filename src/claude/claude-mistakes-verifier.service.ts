import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';
import { describeClientWaits } from './client-wait-facts';
import { formatTranscript } from './transcript-formatter';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const VERIFY_TOOL_NAME = 'submit_verified_mistakes';

export type VerifyMistakesParams = {
  clientName: string;
  messages: ChatMessage[];
  mistakes: string;
};

type ClaimDecision = { claim: string; confirmed: boolean; reason: string };

export type VerifiedMistakes = {
  confirmedClaims: string[];
};

/**
 * Second pass over a LOW-scored chat: the first evaluator cannot see photos/videos and has repeatedly
 * written claims the owner then disproved from the raw chat ("did not send colours", "other model",
 * invented delays — 2026-10-15). Re-reads the full transcript and keeps only claims the TEXT proves.
 */
@Injectable()
export class ClaudeMistakesVerifierService {
  private readonly logger = new Logger(ClaudeMistakesVerifierService.name);
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async verifyMistakes(params: VerifyMistakesParams): Promise<VerifiedMistakes> {
    const response = await withHardTimeout(
      this.client.messages.create({
        model: this.appConfig.getAnthropicModel(),
        max_tokens: 2000,
        tools: [this.buildVerifyTool()],
        tool_choice: { type: 'tool', name: VERIFY_TOOL_NAME },
        messages: [{ role: 'user', content: this.buildPrompt(params) }],
      }),
      'ClaudeMistakesVerifierService.verifyMistakes',
    );

    return this.extractVerified(response, params.clientName);
  }

  private buildPrompt(params: VerifyMistakesParams): string {
    return [
      `Ниже — переписка менеджеров с клиенткой ${params.clientName} и список претензий к менеджерам, который написал`,
      'другой оценщик. Этот оценщик НЕ видит фото и видео (только пометки [фото]/[відео]) и уже ошибался: писал',
      'претензии, которых в переписке нет. Твоя задача — оставить ТОЛЬКО претензии, которые доказывает ТЕКСТ.',
      'Разбей список на ОТДЕЛЬНЫЕ простые претензии (одна претензия — один человек и одно действие). Если в одной',
      'фразе смешаны доказанная и недоказанная части (например, задержка доказана, а "без цены на фото" нет) —',
      'раздели: подтверждённую часть верни отдельной претензией (можно сократить, но нельзя ничего добавлять),',
      'недоказанную часть снимай. Для каждой проверь по транскрипту:',
      '1. Названный человек, время и цитата реально есть в переписке и означают именно то, что утверждается.',
      '2. "Не ответила / не назвала / не прислала / проигнорировала": перечитай ВСЕ сообщения после этого',
      'момента, включая через секунды и [фото]/[відео]. Если менеджер после вопроса прислал текст по теме или',
      'медиа — претензию СНИМАЙ (что на фото, ты не видишь).',
      '3. Любое утверждение о том, что показано на фото/видео (цвета, "другая модель", размеры, "без описания")',
      '— снимай. Расхождение материала/цвета/названия между РАЗНЫМИ сообщениями ("шкіра" в одном, "замша" в другом)',
      'ничего не доказывает: ты не знаешь, какая модель на каком видео/фото, а касание после консультации относится',
      'к той же сумке. Такие претензии снимай всегда.',
      '4. Задержка ожидания клиентки: подтверждай по блоку ОЖИДАНИЕ КЛИЕНТКИ; число должно совпадать с ним',
      '(±5 мин). Разрыв между двумя сообщениями МЕНЕДЖЕРА (обещала "кілька хвилин" — прислала через 3 часа)',
      'подтверждай по меткам времени в переписке. Ночь 00:00-08:00 не считается.',
      '5. Если виновата не названная персона (ответила коллега, пробел смены, молчание клиентки) — снимай.',
      '6. Менеджер лишь упомянул акцию/скидку, представился именем руководителя смены, прислал стандартный',
      'шаблон "модели нет в наличии, предзаказ" — это НЕ ошибка, снимай.',
      '7. ИСКЛЮЧЕНИЕ — факт, который владелица обязана знать, даже если вина не личная: клиентка согласилась',
      'или оплатила, а потом ей сообщили, что товара нет. Оставь это как ФАКТ без обвинения конкретного человека.',
      'Если сомневаешься в остальном — снимай: ложная претензия хуже пропущенной.',
      'По КАЖДОЙ претензии из списка дай решение (confirmed true/false) и причину в одну фразу со ссылкой на время.',
      'Подтверждённые претензии в поле claim верни дословно, как они были написаны.',
      '',
      `СПИСОК ПРЕТЕНЗИЙ:\n${params.mistakes}`,
      '',
      describeClientWaits(params.messages),
      '',
      `ПЕРЕПИСКА:\n${formatTranscript(params.messages)}`,
    ].join('\n');
  }

  private buildVerifyTool(): Anthropic.Tool {
    return {
      name: VERIFY_TOOL_NAME,
      description: 'Return only the claims about managers that the chat text proves.',
      input_schema: {
        type: 'object',
        properties: {
          decisions: {
            type: 'array',
            description: 'По одному элементу на КАЖДУЮ претензию из списка.',
            items: {
              type: 'object',
              properties: {
                claim: { type: 'string', description: 'Претензия дословно.' },
                confirmed: { type: 'boolean' },
                reason: { type: 'string', description: 'Одна фраза: чем подтверждена или почему снята (время сообщения).' },
              },
              required: ['claim', 'confirmed', 'reason'],
            },
          },
        },
        required: ['decisions'],
      },
    };
  }

  /** A forced tool call is not a type guarantee — a missing or empty decisions array is rejected, not guessed. */
  private extractVerified(response: Anthropic.Message, clientName: string): VerifiedMistakes {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude did not return a verification');

    const input = toolUse.input as { decisions?: unknown };
    if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
      throw new Error(`Claude returned no decisions (stop_reason: ${response.stop_reason})`);
    }
    const decisions = input.decisions.filter((decision): decision is ClaimDecision => this.isClaimDecision(decision));
    decisions.forEach((decision) => this.logger.log(`[${clientName}] ${decision.confirmed ? 'kept' : 'dropped'}: ${decision.reason}`));

    const confirmedClaims = decisions.filter((decision) => decision.confirmed && decision.claim.trim().length > 0).map((decision) => decision.claim);
    return { confirmedClaims };
  }

  private isClaimDecision(value: unknown): value is ClaimDecision {
    const candidate = value as Partial<ClaimDecision> | null;
    return typeof candidate?.claim === 'string' && typeof candidate.confirmed === 'boolean' && typeof candidate.reason === 'string';
  }
}
