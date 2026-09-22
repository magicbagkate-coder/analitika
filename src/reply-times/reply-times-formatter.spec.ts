import { formatShiftSpeedBlock } from './reply-times-formatter';
import type { ShiftWindow } from './reply-times.types';

const WINDOW: ShiftWindow = { since: new Date('2026-09-20T20:45:00.000Z'), until: new Date('2026-09-21T12:45:00.000Z') };

describe('formatShiftSpeedBlock', () => {
  it('sends nothing when nobody replied in the shift', () => {
    expect(formatShiftSpeedBlock(WINDOW, [])).toBe('');
  });

  it('shows the shift, and per manager the average wait and the number of replies', () => {
    const block = formatShiftSpeedBlock(WINDOW, [
      { managerName: 'Бурнацева Ольга', replies: 12, averageMinutes: 4.24 },
      { managerName: 'Віолетта Бабак', replies: 3, averageMinutes: 10 },
    ]);

    expect(block).toContain('Скорость ответа менеджеров за смену');
    expect(block).toContain('21.09, с 23:45 до 15:45');
    expect(block).toContain('• <b>Бурнацева Ольга</b> — в среднем 4,2 хв (ответов: 12)');
    expect(block).toContain('• <b>Віолетта Бабак</b> — в среднем 10,0 хв (ответов: 3)');
  });

  it('keeps the given order (busiest manager first)', () => {
    const block = formatShiftSpeedBlock(WINDOW, [
      { managerName: 'Перша', replies: 9, averageMinutes: 1 },
      { managerName: 'Друга', replies: 2, averageMinutes: 1 },
    ]);

    expect(block.indexOf('Перша')).toBeLessThan(block.indexOf('Друга'));
  });

  it('escapes a manager name so Telegram HTML never rejects the message', () => {
    const block = formatShiftSpeedBlock(WINDOW, [{ managerName: 'A&B <x>', replies: 1, averageMinutes: 1 }]);

    expect(block).toContain('A&amp;B &lt;x&gt;');
  });
});
