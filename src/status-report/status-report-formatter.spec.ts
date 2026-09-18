import { formatAttentionBlock, formatChatBlock, formatSummaryBlock } from './status-report-formatter';
import type { ChatOutcome } from './status-report.types';

function baseOutcome(overrides: Partial<ChatOutcome> = {}): ChatOutcome {
  return {
    chatId: '1',
    clientName: 'test_client',
    managerNames: ['Аня'],
    score: 4,
    purchased: true,
    goodPoints: 'Швидко відповіла',
    closingSummary: 'Клієнтка оформила замовлення',
    mistakes: 'Немає',
    recommendation: 'Немає',
    isLost: false,
    clientConflict: false,
    responseTimes: { intervalsMinutes: [], medianMinutes: null },
    ...overrides,
  };
}

describe('formatChatBlock', () => {
  it('includes the score and client name', () => {
    const block = formatChatBlock(baseOutcome());
    expect(block).toContain('test_client');
    expect(block).toContain('Оценка: 4/5');
  });

  it('flags a lost chat', () => {
    const block = formatChatBlock(baseOutcome({ isLost: true }));
    expect(block).toContain('ПОТЕРЯНО');
  });

  it('flags a client conflict', () => {
    const block = formatChatBlock(baseOutcome({ clientConflict: true }));
    expect(block).toContain('КОНФЛИКТ С КЛИЕНТОМ');
  });

  it('shows the closed-deal label when purchased', () => {
    const block = formatChatBlock(baseOutcome({ purchased: true }));
    expect(block).toContain('Клиента закрыли');
  });

  it('shows the not-closed label when not purchased', () => {
    const block = formatChatBlock(baseOutcome({ purchased: false }));
    expect(block).toContain('Клиента не закрыли');
  });

  it('appends the response-time line when there is data', () => {
    const block = formatChatBlock(baseOutcome({ responseTimes: { intervalsMinutes: [5], medianMinutes: 5 } }));
    expect(block).toContain('⏱ Ответы менеджера: 5 хв (медіана — 5 хв)');
  });

  it('omits the response-time line entirely when there is no data', () => {
    const block = formatChatBlock(baseOutcome({ responseTimes: { intervalsMinutes: [], medianMinutes: null } }));
    expect(block).not.toContain('⏱');
  });
});

describe('formatSummaryBlock', () => {
  it('shows how many of the found chats were evaluated', () => {
    const summary = formatSummaryBlock(10, [baseOutcome()]);
    expect(summary).toContain('1 из 10 чатов оценено');
  });

  it('shows the lost count only when at least one chat is lost', () => {
    const withLost = formatSummaryBlock(2, [baseOutcome({ isLost: true }), baseOutcome({ chatId: '2' })]);
    expect(withLost).toContain('<b>Потеряно:</b> 1');

    const withoutLost = formatSummaryBlock(1, [baseOutcome()]);
    expect(withoutLost).not.toContain('Потеряно');
  });

  it('computes the average score correctly', () => {
    const summary = formatSummaryBlock(2, [baseOutcome({ score: 3 }), baseOutcome({ chatId: '2', score: 5 })]);
    expect(summary).toContain('Средняя оценка: 4/5');
  });

  it('pluralizes "чат" correctly in the score distribution', () => {
    const summary = formatSummaryBlock(3, [
      baseOutcome({ score: 4 }),
      baseOutcome({ chatId: '2', score: 4 }),
      baseOutcome({ chatId: '3', score: 5 }),
    ]);
    expect(summary).toContain('4/5 — 2 чата');
    expect(summary).toContain('5/5 — 1 чат');
  });
});

describe('formatAttentionBlock', () => {
  it('returns an empty string when there is nothing critical or repeating', () => {
    expect(formatAttentionBlock('15:45', 10, { critical: '', patterns: '' })).toBe('');
  });

  it('includes the critical block when there is something critical', () => {
    const block = formatAttentionBlock('15:45', 10, { critical: 'Клієнтка чекає відповіді 3 години', patterns: '' });
    expect(block).toContain('Критично, требует личного внимания');
    expect(block).toContain('Клієнтка чекає відповіді 3 години');
  });

  it('includes the patterns block when there is a repeating pattern', () => {
    const block = formatAttentionBlock('15:45', 10, { critical: '', patterns: 'Менеджери не пропонують альтернативу' });
    expect(block).toContain('Повторяющиеся системные проблемы');
  });
});
