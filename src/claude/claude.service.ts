import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';
import { describeClientWaits } from './client-wait-facts';
import { ClaudeMistakesVerifierService } from './claude-mistakes-verifier.service';
import { buildEvaluationInstructions } from './claude-evaluation-instructions';
import { collectManagerNames, describeManagerRoles } from './manager-context';
import { formatTranscript, toKyivTime } from './transcript-formatter';
import type { ChatEvaluationResult } from '../evaluation/evaluation.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const EVALUATION_TOOL_NAME = 'submit_chat_evaluation';
const VERIFY_SCORE_LIMIT = 3;
const NO_MISTAKES_TEXT = 'Явных ошибок нет.';
const SCORE_WITHOUT_MISTAKES = 5;
const MAX_SCORE_WITH_MISTAKES = 4;
const INCOMPLETE_EVALUATION_PREFIX = 'Claude returned an incomplete evaluation';

/** Asks Claude to score a manager-client chat and explain the outcome. */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private readonly client: Anthropic;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly mistakesVerifier: ClaudeMistakesVerifierService,
  ) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async evaluateChat(messages: ChatMessage[], clientName: string): Promise<ChatEvaluationResult> {
    const evaluation = await this.requestEvaluationWithRetry(messages, clientName);
    return this.applyScoreRule(await this.verifyLowScore({ evaluation, messages, clientName }));
  }

  /**
   * A low score rests on written claims, and the owner disproved several of them from the raw chat
   * (2026-10-15). So every claim behind a score of 3 or less is re-checked against the text; if none
   * survives, the chat has no proven personal mistakes and gets the "no mistakes" score. A failed
   * check keeps the original result — a missing check must not drop the chat from the report.
   */
  private async verifyLowScore(params: { evaluation: ChatEvaluationResult; messages: ChatMessage[]; clientName: string }): Promise<ChatEvaluationResult> {
    const { evaluation, messages, clientName } = params;
    if (evaluation.mistakes.startsWith(NO_MISTAKES_TEXT) || evaluation.score > VERIFY_SCORE_LIMIT) return evaluation;

    try {
      const verified = await this.mistakesVerifier.verifyMistakes({ clientName, messages, mistakes: evaluation.mistakes });
      if (verified.confirmedClaims.length > 0) return { ...evaluation, mistakes: verified.confirmedClaims.join(' ') };
      return { ...evaluation, mistakes: NO_MISTAKES_TEXT };
    } catch (error) {
      this.logger.warn(`Could not verify mistakes for ${clientName}, keeping the original: ${(error as Error).message}`);
      return evaluation;
    }
  }

  /**
   * 4 vs 5 for a chat with no proven mistakes used to be a coin flip of the model (2026-10-16: the same
   * flawless chats scored 4 or 5 from run to run). Owner's rule: no proven personal mistakes = 5;
   * with mistakes the model's own score stands but is capped at 4.
   */
  private applyScoreRule(evaluation: ChatEvaluationResult): ChatEvaluationResult {
    if (evaluation.mistakes.startsWith(NO_MISTAKES_TEXT)) return { ...evaluation, score: SCORE_WITHOUT_MISTAKES };
    return { ...evaluation, score: Math.min(evaluation.score, MAX_SCORE_WITH_MISTAKES) };
  }

  /** The model sometimes leaves a required field out of a finished tool call; a second try almost always fills it. */
  private async requestEvaluationWithRetry(messages: ChatMessage[], clientName: string): Promise<ChatEvaluationResult> {
    try {
      return await this.requestEvaluation(messages, clientName);
    } catch (error) {
      if (!(error as Error).message.startsWith(INCOMPLETE_EVALUATION_PREFIX)) throw error;
      this.logger.warn(`Retrying evaluation of ${clientName}: ${(error as Error).message}`);
      return this.requestEvaluation(messages, clientName);
    }
  }

  private async requestEvaluation(messages: ChatMessage[], clientName: string): Promise<ChatEvaluationResult> {
    const transcript = formatTranscript(messages);
    const managerNames = collectManagerNames(messages);
    const response = await withHardTimeout(
      this.client.messages.create({
        model: this.appConfig.getAnthropicModel(),
        // Bumped from 1200 (2026-09-15 incident) — thinking can eat the budget before every field is
        // written, and extractEvaluation now throws on any missing field rather than silently
        // fabricating a score, so a too-tight budget here means a real chat gets skipped this run.
        max_tokens: 2000,
        tools: [this.buildEvaluationTool()],
        tool_choice: { type: 'tool', name: EVALUATION_TOOL_NAME },
        messages: [
          {
            role: 'user',
            content: [
              // Identical on every call — cached so we only pay full price for it once a day.
              { type: 'text', text: buildEvaluationInstructions(), cache_control: { type: 'ephemeral' } },
              { type: 'text', text: this.buildDynamicContext({ clientName, managerNames, transcript, messages }) },
            ],
          },
        ],
      }),
      'ClaudeService.evaluateChat',
    );

    return this.extractEvaluation(response);
  }

  private buildDynamicContext(params: { clientName: string; managerNames: string[]; transcript: string; messages: ChatMessage[] }): string {
    const { clientName, managerNames, transcript, messages } = params;
    return [
      `Клиентка: ${clientName}.`,
      `Текущая дата (Киев): ${toKyivTime(new Date().toISOString())}.`,
      describeManagerRoles(managerNames),
      '',
      describeClientWaits(messages),
      '',
      transcript,
    ].join('\n');
  }

  private buildEvaluationTool(): Anthropic.Tool {
    const shared = 'На русском языке, 1-3 коротких предложения, без вступлений. Если участвовало несколько ' +
      'менеджеров — называй конкретного человека по имени, а не обобщённо "менеджер".';
    return {
      name: EVALUATION_TOOL_NAME,
      description: 'Submit the chat evaluation score, expert breakdown, and purchase outcome.',
      input_schema: {
        type: 'object',
        properties: {
          score: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            description:
              'Оценка КАЧЕСТВА РАБОТЫ менеджера, а не факта закрытия сделки — это разные вещи. Сделка ещё не ' +
              'закрыта (клиентка думает/не ответила) САМА ПО СЕБЕ не повод занижать оценку, если менеджер всё ' +
              'сделал правильно и по регламенту: это 4-5/5, а не 2/5. 5 = отличная работа (сделка закрыта, ИЛИ ' +
              'клиентка в процессе, но менеджер всё сделал верно и по регламенту). 4 = хорошая работа, максимум ' +
              'мелкие недочёты. 3 = средне: есть реальные, подтверждённые перепиской промахи, которые заметно ' +
              'тормозят продажу. Идеи "как можно было сильнее" без реальных промахов — это 4-5, а не 3. Если в ' +
              'mistakes нет личных промахов ("Явных ошибок нет") — оценка 5. Если ошибки есть — не выше 4. ' +
              '2 = плохо, явные ошибки, которые реально мешают продаже (проигнорировал вопрос, нарушил регламент, ' +
              'грубость). 1 = очень плохо, грубые нарушения. Низкая оценка — только за реальные промахи в ' +
              'процессе, не за то, что клиентка пока не решилась.',
          },
          purchased: { type: ['boolean', 'null'] },
          goodPoints: { type: 'string', description: `Что сделали хорошо. ${shared}` },
          closingSummary: {
            type: 'string',
            description: `Если НЕ закрыли на покупку — короткая причина; если купил — что сработало. ${shared}`,
          },
          mistakes: {
            type: 'string',
            description:
              'Только РЕАЛЬНЫЕ промахи, подтверждённые ТЕКСТОМ переписки. Каждый — по форме "Имя, ЧЧ:ММ: что ' +
              'именно (короткая цитата)"; о задержке — только по блоку ОЖИДАНИЕ КЛИЕНТКИ. Если реальных ' +
              'промахов нет — так и напиши: "Явных ошибок нет." и ничего не выдумывай. Идеи, как можно было ' +
              `сыграть сильнее, идут в recommendation, а не сюда. ${shared}`,
          },
          recommendation: {
            type: 'string',
            description:
              `Обязательный конкретный тактический совет для этого диалога, даже если ошибок не было. ${shared}`,
          },
          clientConflict: {
            type: 'boolean',
            description:
              'true, если клиентка в переписке явно выразила недовольство САМОЙ КОММУНИКАЦИЕЙ менеджеров — ' +
              'раздражение, просьбу прекратить писать ("зупиніться", "досить"), жалобу на навязчивость/шаблонные ' +
              'скрипты, угрозу пожаловаться публично, грубость в ответ на сообщения. Считается даже одна такая ' +
              'фраза, даже если менеджер потом извинился и всё сгладил. НЕ считается конфликтом обычный отказ от ' +
              'покупки без признаков раздражения ("не потрібно", "не цікаво", "подумаю"). При сомнении — true.',
          },
        },
        required: ['score', 'purchased', 'goodPoints', 'closingSummary', 'mistakes', 'recommendation', 'clientConflict'],
      },
    };
  }

  private extractEvaluation(response: Anthropic.Message): ChatEvaluationResult {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude did not return an evaluation');

    const input = toolUse.input as Partial<ChatEvaluationResult>;
    this.assertComplete(input, response.stop_reason);
    return input as ChatEvaluationResult;
  }

  /**
   * A forced tool call isn't a hard type guarantee — a missing field here once reached escapeHtml
   * downstream unguarded and crashed the whole report (2026-09-15, see project memory). Throwing
   * lets the existing per-chat error isolation (StatusReportService.tryEvaluateOneChat) skip just
   * this one chat instead of a malformed value corrupting the report, or worse, silently
   * fabricating a score that looks like a real evaluation.
   */
  private assertComplete(input: Partial<ChatEvaluationResult>, stopReason: string | null): void {
    const requiredKeys = ['score', 'purchased', 'goodPoints', 'closingSummary', 'mistakes', 'recommendation', 'clientConflict'] as const;
    const missing = requiredKeys.filter((key) => input[key] === undefined);
    if (missing.length > 0) {
      throw new Error(`Claude returned an incomplete evaluation (missing: ${missing.join(', ')}, stop_reason: ${stopReason})`);
    }
  }
}
