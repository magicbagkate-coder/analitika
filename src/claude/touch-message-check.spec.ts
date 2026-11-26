import { findUnprovenDetails } from './touch-message-check';

const DIALOG = '[25.11.2026, 10:00] менеджер: Це натуральна італійська шкіра, розмір середній\n[25.11.2026, 10:05] клієнтка: Дякую, подумаю';

describe('findUnprovenDetails', () => {
  it('lets a detail through when the dialog has it and the quote proves it', () => {
    const problems = findUnprovenDetails({
      messageText: 'Знайшла для Вас відеоогляд цієї сумочки з італійської шкіри. Чи хотіли б Ви обрати її?',
      transcript: DIALOG,
      usedDetails: [{ detail: 'італійська шкіра', quote: 'натуральна італійська шкіра' }],
    });
    expect(problems).toEqual([]);
  });

  it('catches a feature word the dialog never uses, even when the writer listed nothing', () => {
    const problems = findUnprovenDetails({ messageText: 'Мʼяка замша дуже стильна', transcript: DIALOG, usedDetails: [] });
    expect(problems).toContain('замш');
  });

  it('catches a quote that is not in the dialog', () => {
    const problems = findUnprovenDetails({
      messageText: 'Дуже стильна модель',
      transcript: DIALOG,
      usedDetails: [{ detail: 'регульований ремінець', quote: 'регульований ремінець у комплекті' }],
    });
    expect(problems).toEqual(['регульований ремінець']);
  });

  it('accepts a message with only general praise', () => {
    expect(findUnprovenDetails({ messageText: 'Дуже стильна та елегантна сумочка', transcript: DIALOG, usedDetails: [] })).toEqual([]);
  });

  it('ignores case and punctuation when it compares', () => {
    const problems = findUnprovenDetails({
      messageText: 'Шкіра чудова',
      transcript: DIALOG,
      usedDetails: [{ detail: 'шкіра', quote: 'НАТУРАЛЬНА, італійська шкіра!' }],
    });
    expect(problems).toEqual([]);
  });
});
