import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';
import { numberChatMarkers, resolveChatNumbers } from '../chat-links/chat-refs';

const SHIFT_PROBLEMS_TOOL_NAME = 'submit_shift_problems';

export type ShiftManagerFacts = { managerName: string; roleLabel: string; recurringIssues: string[] };
export type ShiftFacts = { shiftKey: string; shiftTitle: string; managers: ShiftManagerFacts[] };
export type ShiftProblems = { shiftKey: string; problems: string[] };

/**
 * Owner's request (2026-11-12): per shift, the typical mistakes of that shift's managers in one run.
 * Works only from the per-manager facts that ManagerCharacteristics already produced from the chats —
 * it groups what repeats, it never adds anything new.
 */
@Injectable()
export class ClaudeShiftProblemsService {
  private readonly logger = new Logger(ClaudeShiftProblemsService.name);
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  /** Shifts without a single manager fact are skipped — there is nothing to group. */
  async synthesizeShiftProblems(shifts: ShiftFacts[]): Promise<ShiftProblems[]> {
    const shiftsWithFacts = shifts.filter((shift) => shift.managers.some((manager) => manager.recurringIssues.length > 0));
    if (shiftsWithFacts.length === 0) return [];

    const numbered = shiftsWithFacts.map((shift) => this.numberShiftChats(shift));
    const response = await withHardTimeout(
      this.client.messages.create({
        model: this.appConfig.getAnthropicModel(),
        max_tokens: 4096,
        tools: [this.buildTool()],
        tool_choice: { type: 'tool', name: SHIFT_PROBLEMS_TOOL_NAME },
        messages: [{ role: 'user', content: this.buildPrompt(numbered.map((item) => item.shift)) }],
      }),
      'ClaudeShiftProblemsService.synthesizeShiftProblems',
    );

    const problems = this.extractResult(response, shiftsWithFacts);
    return problems.map((shift) => this.withChatMarkers(shift, numbered));
  }

  /** The chat markers in a shift's facts become short numbers for Claude; `chatIds` turns them back. */
  private numberShiftChats(shift: ShiftFacts): { shift: ShiftFacts; chatIds: string[] } {
    const { texts, chatIds } = numberChatMarkers(shift.managers.flatMap((manager) => manager.recurringIssues));
    let offset = 0;
    const managers = shift.managers.map((manager) => {
      const recurringIssues = texts.slice(offset, offset + manager.recurringIssues.length);
      offset += manager.recurringIssues.length;
      return { ...manager, recurringIssues };
    });
    return { shift: { ...shift, managers }, chatIds };
  }

  private withChatMarkers(problems: ShiftProblems, numbered: { shift: ShiftFacts; chatIds: string[] }[]): ShiftProblems {
    const chatIds = numbered.find((item) => item.shift.shiftKey === problems.shiftKey)?.chatIds ?? [];
    return { ...problems, problems: problems.problems.map((problem) => resolveChatNumbers({ text: problem, chatIds })) };
  }

  private buildPrompt(shifts: ShiftFacts[]): string {
    const sections = shifts.map((shift) => {
      const lines = shift.managers.map((manager) => {
        const issues = manager.recurringIssues.length > 0 ? manager.recurringIssues.map((issue) => `  - ${issue}`).join('\n') : '  - замечаний нет';
        return `${manager.managerName} (${manager.roleLabel}):\n${issues}`;
      });
      return `### ${shift.shiftKey} — ${shift.shiftTitle}\n${lines.join('\n')}`;
    });

    return [
      'Ты помогаешь владелице магазина MagicBag увидеть ошибки смены. Ниже — подтверждённые',
      'замечания по менеджерам каждой смены за один отчёт. Для КАЖДОЙ смены выдели «проблемы',
      'смены»: ошибки, которые повторяются у двух и более менеджеров этой смены; если таких нет —',
      'одну-две самые заметные ошибки с именем менеджера. Используй ТОЛЬКО факты из списка, ничего',
      'не додумывай и не добавляй. Каждый пункт — одна короткая фраза на русском, с именами',
      'менеджеров. Если у смены замечаний нет — пустой массив.',
      'Факты содержат номера чатов вида [#3]. Перенеси номера тех фактов, на которых держится пункт, в',
      'конец пункта: «… [#2] [#7]». Только номера из списка этой смены, выдуманные номера недопустимы.',
      '',
      sections.join('\n\n'),
    ].join('\n');
  }

  private buildTool(): Anthropic.Tool {
    return {
      name: SHIFT_PROBLEMS_TOOL_NAME,
      description: 'Submit the typical problems of each shift for this report.',
      input_schema: {
        type: 'object',
        properties: {
          shifts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                shiftKey: { type: 'string', description: 'The shift key exactly as given, e.g. shift-1.' },
                problems: { type: 'array', items: { type: 'string' }, description: 'Short problems of this shift, empty if none.' },
              },
              required: ['shiftKey', 'problems'],
            },
          },
        },
        required: ['shifts'],
      },
    };
  }

  /** A forced tool call is not a hard type guarantee, so the shape is checked before use. */
  private extractResult(response: Anthropic.Message, asked: ShiftFacts[]): ShiftProblems[] {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      this.logger.warn(`No tool_use block in shift problems response (stop_reason: ${response.stop_reason})`);
      return [];
    }

    const input = toolUse.input as Partial<{ shifts: ShiftProblems[] }>;
    if (!Array.isArray(input.shifts)) {
      this.logger.warn(`Shift problems tool input had no array: ${JSON.stringify(toolUse.input).slice(0, 300)}`);
      return [];
    }

    const askedKeys = new Set(asked.map((shift) => shift.shiftKey));
    return input.shifts.filter((shift) => this.isValid(shift) && askedKeys.has(shift.shiftKey));
  }

  private isValid(shift: ShiftProblems): boolean {
    if (typeof shift.shiftKey !== 'string') return false;
    return Array.isArray(shift.problems) && shift.problems.every((problem) => typeof problem === 'string');
  }
}
