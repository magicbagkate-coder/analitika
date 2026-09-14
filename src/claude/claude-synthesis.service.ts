import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { describeManagersInline } from './manager-context';
import { formatTranscript } from './transcript-formatter';
import type { PatternSynthesisInput } from '../evaluation/evaluation.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const SYNTHESIS_TOOL_NAME = 'submit_pattern_synthesis';
const VERIFICATION_TOOL_NAME = 'submit_critical_verification';

export type PatternSynthesisDraft = { patterns: string; criticalCandidates: string[] };

/**
 * Two-stage "what needs your attention" pipeline. `synthesizePatterns` finds candidate chats from
 * already-summarized `mistakes` text (cheap, whole-batch). `verifyCriticalChat` re-reads one chat's
 * FULL transcript before anything is actually called "critical" — a compressed summary of a summary
 * (mistakes text -> one-line synthesis) overstated severity twice in one morning (2026-09-11, e.g.
 * a manager got blamed for not replying when a colleague had already resolved it the next morning),
 * so nothing reaches the owner as "critical" without going back to the source conversation first.
 */
@Injectable()
export class ClaudeSynthesisService {
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = new Anthropic({ apiKey: this.appConfig.getAnthropicApiKey() });
  }

  async synthesizePatterns(outcomes: PatternSynthesisInput[]): Promise<PatternSynthesisDraft> {
    if (outcomes.length === 0) return { patterns: '', criticalCandidates: [] };

    const response = await this.client.messages.create({
      model: this.appConfig.getAnthropicModel(),
      max_tokens: 2000,
      tools: [this.buildSynthesisTool()],
      tool_choice: { type: 'tool', name: SYNTHESIS_TOOL_NAME },
      messages: [{ role: 'user', content: this.buildSynthesisPrompt(outcomes) }],
    });

    return this.extractSynthesis(response);
  }

  /** Re-reads the FULL dialog before confirming (or rejecting) a candidate as genuinely critical. */
  async verifyCriticalChat(clientName: string, messages: ChatMessage[]): Promise<string> {
    const transcript = formatTranscript(messages);
    const response = await this.client.messages.create({
      model: this.appConfig.getAnthropicModel(),
      max_tokens: 800,
      tools: [this.buildVerificationTool()],
      tool_choice: { type: 'tool', name: VERIFICATION_TOOL_NAME },
      messages: [{ role: 'user', content: this.buildVerificationPrompt(clientName, transcript) }],
    });

    return this.extractVerification(response);
  }

  private buildSynthesisPrompt(outcomes: PatternSynthesisInput[]): string {
    const rows = outcomes
      .map((outcome) => `${outcome.clientName} (${describeManagersInline(outcome.managerNames)}) — ${outcome.score}/5: ${outcome.mistakes}`)
      .join('\n');
    return [
      'Ты — эксперт по продажам, который раз в день просматривает сводку оценок по всем чатам магазина',
      'MagicBag. Данные ниже — это уже сжатые описания ошибок по каждому чату, а не полная переписка.',
      'У каждого менеджера указана роль в скобках. Роли разные по обязанностям — не смешивай их:',
      '"касатель" по регламенту делает ТОЛЬКО шаблонное повторное касание (например, "оформляємо?"),',
      'это не является недоработкой. Касатель осознанно НЕ обязан отрабатывать возражения, консультировать',
      'или предлагать допродажу — это зона "старшого менеджера" и "керівника зміни". НИКОГДА не включай в',
      'паттерны и не бери в критичные кандидаты ситуацию, где претензия к касателю — это "не отработал',
      'возражение" или "не сделал допродажу" — такой паттерн не считается реальной проблемой.',
      '',
      `Данные по ${outcomes.length} чатам (клиентка (менеджеры с ролями) — оценка: ошибки):`,
      rows,
    ].join('\n');
  }

  private buildSynthesisTool(): Anthropic.Tool {
    return {
      name: SYNTHESIS_TOOL_NAME,
      description: 'Submit recurring cross-chat patterns and candidate chats that might need urgent attention.',
      input_schema: {
        type: 'object',
        properties: {
          patterns: {
            type: 'string',
            description:
              'На русском, 1-3 предложения простым текстом без markdown. Повторяющиеся паттерны ошибок сразу у' +
              ' нескольких чатов/менеджеров, не разовые случаи одного чата. Пустая строка, если паттернов нет.',
          },
          criticalCandidates: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Ники клиенток (clientName из данных), чьи чаты ПО ЭТОМУ КРАТКОМУ ОПИСАНИЮ выглядят как требующие' +
              ' срочного личного внимания владелицы — реальный конфликт, упущенная крупная сделка, зависший заказ.' +
              ' Это только кандидаты для дальнейшей проверки по полной переписке, не финальный вывод — лучше' +
              ' включить сомнительный случай, чем пропустить. Пустой массив, если таких нет.',
          },
        },
        required: ['patterns', 'criticalCandidates'],
      },
    };
  }

  private buildVerificationPrompt(clientName: string, transcript: string): string {
    return [
      `Ниже — ПОЛНАЯ переписка менеджеров с клиенткой ${clientName}. По краткому описанию ошибок эта`,
      'ситуация выглядела как требующая срочного личного внимания владелицы магазина. Перечитай весь',
      'диалог внимательно, от начала до конца, с учётом реальных дат и времени (Киев).',
      'Определи строго по фактам из переписки: ситуация ДЕЙСТВИТЕЛЬНО критична прямо сейчас (сорванное',
      'обещание без ответа, реальный конфликт, зависший международный заказ, упущенная почти готовая',
      'сделка), или проблема уже решена сама, или изначальная оценка была преувеличена? Часто более',
      'ранний менеджер обещал уточнить и решить вопрос, а более поздний уже вернулся с ответом — в этом',
      'случае это НЕ критично.',
      'Если критично — опиши суть в 1-2 предложениях с конкретными фактами (кто, что обещал, когда,',
      'что случилось с тех пор). Если не критично или уже решено — верни пустую строку. Не преувеличивай',
      'и не выдумывай — если сомневаешься, лучше вернуть пустую строку.',
      '',
      transcript,
    ].join('\n');
  }

  private buildVerificationTool(): Anthropic.Tool {
    return {
      name: VERIFICATION_TOOL_NAME,
      description: 'Submit whether this chat is genuinely critical after reading the full transcript.',
      input_schema: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description:
              'На русском, 1-2 предложения, конкретные факты. Пустая строка, если ситуация НЕ критична или уже решена.',
          },
        },
        required: ['description'],
      },
    };
  }

  private extractSynthesis(response: Anthropic.Message): PatternSynthesisDraft {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return { patterns: '', criticalCandidates: [] };

    return toolUse.input as PatternSynthesisDraft;
  }

  private extractVerification(response: Anthropic.Message): string {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return '';

    const input = toolUse.input as { description: string };
    return input.description;
  }
}
