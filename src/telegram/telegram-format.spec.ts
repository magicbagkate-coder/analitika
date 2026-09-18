import { escapeHtml, formatManagerNames, formatResponseTimesLine } from './telegram-format';

describe('escapeHtml', () => {
  it('escapes &, < and >', () => {
    expect(escapeHtml('Ціна < 100 & > 50 грн')).toBe('Ціна &lt; 100 &amp; &gt; 50 грн');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('звичайний текст')).toBe('звичайний текст');
  });
});

describe('formatManagerNames', () => {
  it('joins multiple names with " / "', () => {
    expect(formatManagerNames(['Аня', 'Оля'])).toBe('Аня / Оля');
  });

  it('falls back to a placeholder when there are no names', () => {
    expect(formatManagerNames([])).toBe('менеджер невідомий');
  });

  it('escapes HTML-unsafe characters inside a manager name', () => {
    expect(formatManagerNames(['A&B'])).toBe('A&amp;B');
  });
});

describe('formatResponseTimesLine', () => {
  it('formats several intervals with the median, exactly as approved', () => {
    const line = formatResponseTimesLine({ intervalsMinutes: [5, 12, 3], medianMinutes: 5 });
    expect(line).toBe('⏱ Ответы менеджера: 5 хв, 12 хв, 3 хв (медіана — 5 хв)');
  });

  it('formats a single 0-minute interval as an instant reply, not as missing', () => {
    const line = formatResponseTimesLine({ intervalsMinutes: [0], medianMinutes: 0 });
    expect(line).toBe('⏱ Ответы менеджера: 0 хв (медіана — 0 хв)');
  });

  it('returns an empty string when there is nothing measurable', () => {
    expect(formatResponseTimesLine({ intervalsMinutes: [], medianMinutes: null })).toBe('');
  });
});
