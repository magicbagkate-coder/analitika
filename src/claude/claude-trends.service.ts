import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient, withHardTimeout } from './anthropic-client';

const RECURRING_ISSUES_TOOL_NAME = 'submit_recurring_issues';

export type ManagerWeeklyNotes = {
  managerName: string;
  /** weekIndex 0 = most recent week, 1 = the week before that, etc. */
  weeks: { weekIndex: number; notes: string[] }[];
};

/**
 * Weekly digest question: across a manager's "Вибір товару" mistake notes from the last several
 * weeks, is there ONE specific issue that keeps showing up (not just "many small unrelated
 * mistakes"), and for how many consecutive recent weeks. Different from ClaudeSynthesisService,
 * which looks for patterns within a single run's chats, not across calendar weeks.
 */
@Injectable()
export class ClaudeTrendsService {
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async synthesizeRecurringIssues(managers: ManagerWeeklyNotes[]): Promise<string> {
    if (managers.length === 0) return '';

    const response = await withHardTimeout(
      this.client.messages.create({
        model: this.appConfig.getAnthropicModel(),
        // Same headroom fix as ClaudeSynthesisService — see its comment (2026-09-15 incident).
        max_tokens: 4000,
        tools: [this.buildTool()],
        tool_choice: { type: 'tool', name: RECURRING_ISSUES_TOOL_NAME },
        messages: [{ role: 'user', content: this.buildPrompt(managers) }],
      }),
      'ClaudeTrendsService.synthesizeRecurringIssues',
    );

    return this.extractResult(response);
  }

  private buildPrompt(managers: ManagerWeeklyNotes[]): string {
    const sections = managers.map((manager) => {
      const weekLines = manager.weeks
        .sort((a, b) => a.weekIndex - b.weekIndex)
        .map((week) => `Неделя ${week.weekIndex + 1} назад:\n${week.notes.map((note) => `- ${note}`).join('\n')}`)
        .join('\n');
      return `### ${manager.managerName}\n${weekLines}`;
    });

    return [
      'Ты — эксперт по продажам магазина MagicBag. Ниже — заметки об ошибках конкретных менеджеров',
      'из разборов чатов "Вибір товару", сгруппированные по неделям (неделя 1 назад — самая свежая).',
      'Для КАЖДОГО менеджера определи: повторяется ли у него ОДНА конкретная проблема (не просто',
      'разные мелкие ошибки) минимум в 2 последних неделях подряд. Разные несвязанные ошибки в',
      'разные недели — это НЕ повторяющаяся проблема, пропусти такого менеджера.',
      'Если проблема повторяется — опиши её конкретно (что именно) и сколько недель подряд.',
      'Если нет ни одного менеджера с реальной повторяющейся проблемой — верни пустую строку.',
      '',
      sections.join('\n\n'),
    ].join('\n');
  }

  private buildTool(): Anthropic.Tool {
    return {
      name: RECURRING_ISSUES_TOOL_NAME,
      description: 'Submit which managers have one specific mistake repeating across recent weeks.',
      input_schema: {
        type: 'object',
        properties: {
          issues: {
            type: 'string',
            description:
              'На русском, простым текстом без markdown, 1 строка на менеджера с проблемой ' +
              '("Имя: <конкретная проблема>, N недель подряд"), разные менеджеры — на новой строке. ' +
              'Пустая строка, если ни у кого нет реально повторяющейся проблемы.',
          },
        },
        required: ['issues'],
      },
    };
  }

  private extractResult(response: Anthropic.Message): string {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return '';

    const input = toolUse.input as { issues: string };
    return input.issues;
  }
}
