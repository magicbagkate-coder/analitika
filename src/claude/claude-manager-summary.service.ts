import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient } from './anthropic-client';
import { getManagerRole } from '../evaluation/manager-roles.constants';
import type { EvaluationSource } from '../evaluation-history/evaluation-history.types';

const CHARACTERISTICS_TOOL_NAME = 'submit_manager_characteristics';

export type ManagerRunEntry = { source: EvaluationSource; score: number; note: string };
export type ManagerRunNotes = { managerName: string; entries: ManagerRunEntry[] };
export type ManagerCharacteristic = { managerName: string; score: number; recurringIssues: string[] };

/**
 * Owner's rule (2026-09-15): one combined per-manager characteristic at the end of the twice-daily
 * run, covering BOTH statuses ("Вибір товару" quality chats and "Замовлення створено" closed
 * deals) in a single Claude call — not a separate call per manager. Different question from
 * ClaudeSynthesisService (patterns within one status's chats) and ClaudeTrendsService (trend across
 * calendar weeks, "Вибір товару" only): this is "give this manager one score + concrete recurring
 * facts for everything they touched in this run, across both statuses."
 */
@Injectable()
export class ClaudeManagerSummaryService {
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async synthesizeCharacteristics(managers: ManagerRunNotes[]): Promise<ManagerCharacteristic[]> {
    if (managers.length === 0) return [];

    const response = await this.client.messages.create({
      model: this.appConfig.getAnthropicModel(),
      // Same headroom fix as ClaudeSynthesisService — see its comment (2026-09-15 incident).
      max_tokens: 4000,
      tools: [this.buildTool()],
      tool_choice: { type: 'tool', name: CHARACTERISTICS_TOOL_NAME },
      messages: [{ role: 'user', content: this.buildPrompt(managers) }],
    });

    return this.extractResult(response);
  }

  private buildPrompt(managers: ManagerRunNotes[]): string {
    const sections = managers.map((manager) => {
      const role = getManagerRole(manager.managerName) ?? 'роль неизвестна';
      const lines = manager.entries.map((entry) => `- [${this.describeSource(entry.source)}, ${entry.score}/5]: ${entry.note}`);
      return `### ${manager.managerName} (${role})\n${lines.join('\n')}`;
    });

    return [
      'Ты — эксперт по продажам магазина MagicBag. Ниже — данные по ВСЕМ чатам, обработанным за',
      'этот прогон отчёта (дважды в день), сгруппированные по менеджеру. Два разных статуса дают',
      'разные по смыслу данные: "Вибір товару" — оценка КАЧЕСТВА РАБОТЫ менеджера с клиентом ещё',
      'в процессе; "Замовлення створено" — сделка УЖЕ закрыта, там оценка чисто техническая (была',
      'подтверждённая допродажа — 5, не было — 4), это не про качество процесса.',
      'Роли разные по обязанностям — учитывай их и НИКОГДА не пиши в замечаниях касателю, что он не',
      'отработал возражение или не сделал допродажу, это не его работа по регламенту. То же для "сервіс',
      'менеджера" — он занимается уже оформленным заказом (обмен, брак, логистика), не консультацией.',
      '',
      `Данные по ${managers.length} менеджерам:`,
      sections.join('\n\n'),
      '',
      'Для КАЖДОГО менеджера из списка выше:',
      '1. Поставь ОДНУ итоговую оценку 1-5 за этот прогон. В первую очередь опирайся на оценки',
      '"Вибір товару" (это про качество работы) — данные "Замовлення створено" учитывай как',
      'дополнительный контекст, а не механически усредняй с оценками другого смысла.',
      '2. Перечисли КОНКРЕТНЫЕ факты — то, что реально повторилось хотя бы дважды за этот прогон,',
      'или один значимый промах. На русском, без общих оценочных слов ("хорошо справляется",',
      '"работает нормально") — только конкретика (что, когда, в каком чате). Пустой список, если',
      'нечего конкретно отметить.',
    ].join('\n');
  }

  private describeSource(source: EvaluationSource): string {
    return source === 'product_selection' ? 'Вибір товару' : 'Замовлення створено';
  }

  private buildTool(): Anthropic.Tool {
    return {
      name: CHARACTERISTICS_TOOL_NAME,
      description: 'Submit one score and concrete recurring facts per manager for this run.',
      input_schema: {
        type: 'object',
        properties: {
          characteristics: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                managerName: { type: 'string' },
                score: { type: 'integer', minimum: 1, maximum: 5, description: 'Итоговая оценка менеджера за этот прогон, 1-5.' },
                recurringIssues: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Конкретные факты/повторяющиеся ошибки этого менеджера за этот прогон, на русском, без ' +
                    'оценочных слов. Пустой массив, если отмечать нечего.',
                },
              },
              required: ['managerName', 'score', 'recurringIssues'],
            },
          },
        },
        required: ['characteristics'],
      },
    };
  }

  private extractResult(response: Anthropic.Message): ManagerCharacteristic[] {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return [];

    const input = toolUse.input as { characteristics: ManagerCharacteristic[] };
    return input.characteristics.filter((characteristic) => this.isValid(characteristic));
  }

  /**
   * A forced tool call isn't a hard type guarantee (same caveat as EvaluationHistoryService's note
   * coercion) — a malformed entry here crashed the whole process once already (2026-09-15, missing
   * managerName reached escapeHtml downstream unguarded). Validate at this boundary instead.
   */
  private isValid(characteristic: ManagerCharacteristic): boolean {
    if (typeof characteristic.managerName !== 'string' || characteristic.managerName.length === 0) return false;
    if (typeof characteristic.score !== 'number') return false;
    if (!Array.isArray(characteristic.recurringIssues)) return false;
    return characteristic.recurringIssues.every((issue) => typeof issue === 'string');
  }
}
