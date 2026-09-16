import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient } from './anthropic-client';
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
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async synthesizePatterns(outcomes: PatternSynthesisInput[]): Promise<PatternSynthesisDraft> {
    if (outcomes.length === 0) return { patterns: '', criticalCandidates: [] };

    const response = await this.client.messages.create({
      model: this.appConfig.getAnthropicModel(),
      // 2000 wasn't enough for a large batch (48 chats, 2026-09-15 recovery) — thinking + a full
      // multi-sentence patterns write-up burned the whole budget before finishing, returning an
      // empty tool input with stop_reason "max_tokens". 4000 leaves real headroom either way.
      max_tokens: 4000,
      tools: [this.buildSynthesisTool()],
      tool_choice: { type: 'tool', name: SYNTHESIS_TOOL_NAME },
      messages: [{ role: 'user', content: this.buildSynthesisPrompt(outcomes) }],
    });

    return this.extractSynthesis(response);
  }

  /**
   * Re-reads the FULL dialog before confirming (or rejecting) a candidate as genuinely critical.
   * `guaranteedConflict` is set for chats StatusReportService already flagged via clientConflict —
   * the owner's rule (2026-09-15): any client complaint/irritation about the communication itself is
   * 100% reported, no LLM discretion to drop it here. In that mode this call only describes the
   * already-confirmed conflict and must not return an empty string.
   */
  async verifyCriticalChat(clientName: string, messages: ChatMessage[], guaranteedConflict = false): Promise<string> {
    const transcript = formatTranscript(messages);
    const response = await this.client.messages.create({
      model: this.appConfig.getAnthropicModel(),
      // Bumped from 800 (2026-09-15 incident, same headroom reasoning as the batch synthesis calls).
      max_tokens: 1200,
      tools: [this.buildVerificationTool()],
      tool_choice: { type: 'tool', name: VERIFICATION_TOOL_NAME },
      messages: [{ role: 'user', content: this.buildVerificationPrompt(clientName, transcript, guaranteedConflict) }],
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
      '"Сервіс менеджер" занимается уже оформленным заказом (обмен, брак, логистика) — по тем же причинам',
      'не считай реальной проблемой, если он не консультировал по выбору товара или не делал допродажу.',
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

  private buildVerificationPrompt(clientName: string, transcript: string, guaranteedConflict: boolean): string {
    if (guaranteedConflict) {
      return [
        `Ниже — ПОЛНАЯ переписка менеджеров с клиенткой ${clientName}. Клиентка уже явно выразила`,
        'недовольство самой коммуникацией менеджеров (раздражение, просьба прекратить писать, жалоба на',
        'навязчивость, угроза пожаловаться и т.п.) — это НЕ подлежит сомнению и НЕ подлежит переоценке здесь,',
        'по правилу владелицы магазина такой чат 100% должен попасть в отчёт "Обратить внимание".',
        'Твоя единственная задача — описать сам конфликт фактически в 1-2 предложениях: что конкретно',
        'вызвало недовольство клиентки, кто из менеджеров (по имени) и на каком этапе это сделал, чем',
        'закончилось (извинились/эскалировали/без ответа). НИКОГДА не возвращай пустую строку в этом режиме —',
        'даже если ситуация выглядит уже сглаженной извинениями, опиши сам факт конфликта.',
        '',
        transcript,
      ].join('\n');
    }

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

    // A forced tool call isn't a hard type guarantee — an incomplete response (e.g. hit max_tokens)
    // once reached escapeHtml downstream as a bare `undefined` (2026-09-15). '' is already the
    // established "nothing to report" sentinel every caller here checks for, so it's a safe default —
    // ConflictWatcherService/StatusReportService's guaranteedConflict callers fall back from it too.
    const input = toolUse.input as Partial<{ description: string }>;
    return input.description ?? '';
  }
}
