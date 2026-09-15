import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient } from './anthropic-client';
import { collectManagerNames, describeManagerRoles, describeManagersInline } from './manager-context';
import { formatTranscript, toKyivTime } from './transcript-formatter';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const SUCCESS_TOOL_NAME = 'submit_success_factors';
const SUCCESS_PATTERNS_TOOL_NAME = 'submit_success_patterns';

export type SuccessFactorsResult = { successFactors: string; hadUpsell: boolean };

/** One closed deal's essentials, as input to ClaudeSuccessService.synthesizeSuccessPatterns. */
export type SuccessPatternInput = { clientName: string; managerNames: string[]; successFactors: string };

/**
 * Asks Claude what specifically led to a closed deal — a different lens than ClaudeService's
 * quality/mistake scoring. Used only for OrderSuccessAnalysisModule, for chats whose status
 * ("Замовлення створено") means the sale is already won, so "was this handled well" isn't the
 * useful question anymore — "what exactly worked, so it can be repeated" is.
 */
@Injectable()
export class ClaudeSuccessService {
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async analyzeSuccessFactors(messages: ChatMessage[], clientName: string): Promise<SuccessFactorsResult> {
    const transcript = formatTranscript(messages);
    const managerNames = collectManagerNames(messages);
    const response = await this.client.messages.create({
      model: this.appConfig.getAnthropicModel(),
      max_tokens: 1000,
      tools: [this.buildSuccessTool()],
      tool_choice: { type: 'tool', name: SUCCESS_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: this.buildStaticInstructions(), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: this.buildDynamicContext(clientName, managerNames, transcript) },
          ],
        },
      ],
    });

    return this.extractResult(response);
  }

  /**
   * Cross-chat "what systemically works" pattern, analogous to ClaudeSynthesisService.synthesizePatterns.
   * claude-sonnet-5's extended thinking eats into the budget before any output text — a synthesis-style
   * call once came back silently empty at max_tokens: 500, and again at 2000 with a large batch (48
   * chats, 2026-09-15) — stop_reason "max_tokens" with an empty tool input either time. 4000 is the
   * level that's reliably left room for real output so far, but this scales with batch size, so watch
   * for the same silent-empty failure again on an unusually large run.
   */
  async synthesizeSuccessPatterns(outcomes: SuccessPatternInput[]): Promise<string> {
    if (outcomes.length === 0) return '';

    const response = await this.client.messages.create({
      model: this.appConfig.getAnthropicModel(),
      max_tokens: 4000,
      tools: [this.buildSuccessPatternsTool()],
      tool_choice: { type: 'tool', name: SUCCESS_PATTERNS_TOOL_NAME },
      messages: [{ role: 'user', content: this.buildSuccessPatternsPrompt(outcomes) }],
    });

    return this.extractPatterns(response);
  }

  private buildSuccessPatternsPrompt(outcomes: SuccessPatternInput[]): string {
    const rows = outcomes
      .map((outcome) => `${outcome.clientName} (${describeManagersInline(outcome.managerNames)}): ${outcome.successFactors}`)
      .join('\n');
    return [
      'Ты — эксперт по продажам, который раз в день просматривает сводку уже ЗАКРЫТЫХ сделок магазина',
      'MagicBag. Данные ниже — короткое описание того, что сработало в каждой отдельной сделке.',
      'У каждого менеджера указана роль в скобках. "Касатель" по регламенту делает только шаблонное',
      'повторное касание — НИКОГДА не включай в паттерн его "работу с возражениями" или "допродажу",',
      'это не его роль, даже если рядом это сделал другой менеджер.',
      'Найди повторяющийся системный приём — то, что срабатывает НЕ в одном чате, а в нескольких сразу',
      '(например: быстрая допродажа сразу после согласия на основной товар, конкретное предложение',
      'брони при "подумаю", персональное возвращение к клиентке через час тишины). Разовый приём в одном',
      'чате — не паттерн, пропусти его.',
      '',
      `Данные по ${outcomes.length} закрытым сделкам (клиентка (менеджеры с ролями): что сработало):`,
      rows,
    ].join('\n');
  }

  private buildSuccessPatternsTool(): Anthropic.Tool {
    return {
      name: SUCCESS_PATTERNS_TOOL_NAME,
      description: 'Submit the recurring systemic action that leads to closed deals, if one exists.',
      input_schema: {
        type: 'object',
        properties: {
          patterns: {
            type: 'string',
            description:
              'На русском, 1-3 предложения простым текстом без markdown. Повторяющийся успешный приём сразу у' +
              ' нескольких сделок/менеджеров, не разовый случай одной сделки. Пустая строка, если паттерна нет.',
          },
        },
        required: ['patterns'],
      },
    };
  }

  private extractPatterns(response: Anthropic.Message): string {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return '';

    const input = toolUse.input as { patterns: string };
    return input.patterns;
  }

  private buildStaticInstructions(): string {
    return [
      'Ты — эксперт по продажам магазина женских кожаных сумок MagicBag. Эта сделка УЖЕ закрыта —',
      'статус чата "Замовлення створено" (заказ создан). Твоя задача НЕ искать ошибки и НЕ оценивать',
      'по шкале — нужно конкретно разобрать, какие именно действия менеджера(-ов) реально привели',
      'к этой продаже, чтобы этот приём можно было повторить в других диалогах.',
      'КРИТИЧЕСКИ ВАЖНО: весь разбор пиши ТОЛЬКО на русском языке, даже если сама переписка на украинском.',
      'В диалоге мог участвовать не один человек — называй конкретного менеджера по имени, если его',
      'действие сыграло роль, а не обобщённо "менеджер".',
      'Роли разные по зоне ответственности: молодший менеджер отвечает за скорость и корректный первый',
      'ответ; касатель — только за своевременное шаблонное повторное касание, у него нет допродаж и',
      'работы с возражениями, НИКОГДА не приписывай ему заслугу за это, даже если рядом это сделал',
      'другой менеджер; старший менеджер и керівник зміни — за консультацию, допродажи и закрытие.',
      '"Сервіс менеджер" — занимается уже ОФОРМЛЕННЫМ заказом: обмен, брак, логистика/ТТН, данные',
      'доставки. Это НЕ про консультацию или допродажу — не жди и не приписывай ему это; но если он',
      'оперативно и чётко решил вопрос с браком/заменой/доставкой, это стоит назвать конкретной заслугой.',
      'Будь конкретен и опирайся только на факты из переписки: что именно было сказано/сделано',
      '(например: сразу прислали фото всех цветов, предложили бронь, дожали через рассрочку,',
      'вовремя вернулись после "подумаю", сделали допродажу аксессуара) — а не общие фразы вроде',
      '"хорошая консультация". Если реального конкретного приёма не видно, а заказ просто оформился',
      'без сопротивления — так и напиши, не выдумывай заслугу.',
      'Пиши коротко и по существу, 1-3 предложения — чтобы владелица магазина прочитала за 10 секунд.',
      'Отдельно определи факт допродажи: считается ТОЛЬКО реально состоявшаяся продажа дополнительного',
      'товара/аксессуара сверх того, ради чего клиентка изначально писала, и который вошёл в этот заказ',
      '(клиентка согласилась и подтвердила). Просто предложение менеджера без согласия клиентки,',
      'или предложенный, но не подтверждённый сертификат/аксессуар — это НЕ допродажа.',
    ].join('\n');
  }

  private buildDynamicContext(clientName: string, managerNames: string[], transcript: string): string {
    return [
      `Клиентка: ${clientName}.`,
      `Текущая дата (Киев): ${toKyivTime(new Date().toISOString())}.`,
      describeManagerRoles(managerNames),
      '',
      transcript,
    ].join('\n');
  }

  private buildSuccessTool(): Anthropic.Tool {
    return {
      name: SUCCESS_TOOL_NAME,
      description: 'Submit which specific manager actions led to this closed deal.',
      input_schema: {
        type: 'object',
        properties: {
          successFactors: {
            type: 'string',
            description:
              'На русском, 1-3 коротких предложения, конкретные факты из переписки. Называй менеджера по имени,' +
              ' если его конкретное действие сыграло роль. Не выдумывай заслугу, если её не видно из диалога.',
          },
          hadUpsell: {
            type: 'boolean',
            description:
              'true только если клиентка реально согласилась и в заказ вошёл дополнительный товар/аксессуар' +
              ' сверх изначального запроса. Просто предложение без подтверждения клиентки — false.',
          },
        },
        required: ['successFactors', 'hadUpsell'],
      },
    };
  }

  private extractResult(response: Anthropic.Message): SuccessFactorsResult {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude did not return success factors');

    return toolUse.input as SuccessFactorsResult;
  }
}
