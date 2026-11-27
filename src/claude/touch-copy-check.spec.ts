import { findCopiedPhrase } from './touch-copy-check';

const TRANSCRIPT = 'Менеджер: Елегантна шкіряна сумка — чудове поєднання комфорту, стилю та практичності. 😍 Бажаєте замовити?';

describe('findCopiedPhrase', () => {
  it('finds the manager description pasted into the touch', () => {
    const messageText = 'Знайшла для Вас чудовий відеоогляд цієї сумочки 🤍 Елегантна шкіряна модель, чудове поєднання комфорту, стилю та практичності.';
    expect(findCopiedPhrase({ messageText, transcript: TRANSCRIPT })).toBe('чудове поєднання комфорту стилю');
  });

  it('lets the owner standard opening and closing through', () => {
    const messageText = 'Знайшла для Вас чудовий відеоогляд цієї сумочки 🤍 Ця сумочка створена щоб вражати 😍 Чи хотіли б Ви обрати її для себе?';
    expect(findCopiedPhrase({ messageText, transcript: `${TRANSCRIPT} Чи хотіли б Ви обрати її для себе?` })).toBeNull();
  });

  it('does not mind a few shared words', () => {
    const messageText = 'Знайшла для Вас чудовий відеоогляд цієї сумочки 🤍 Така елегантна, дивіться, як їй личить комфорт';
    expect(findCopiedPhrase({ messageText, transcript: TRANSCRIPT })).toBeNull();
  });
});
