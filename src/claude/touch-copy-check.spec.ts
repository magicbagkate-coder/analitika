import { findBannedWord, findCopiedPhrase, findUnknownProduct } from './touch-copy-check';

const TRANSCRIPT = 'Менеджер: Елегантна шкіряна сумка — чудове поєднання комфорту, стилю та практичності. 😍 Бажаєте замовити?';

describe('findCopiedPhrase', () => {
  it('finds the manager description pasted into the touch', () => {
    const messageText = 'Знайшла для Вас чудовий відеоогляд цієї сумки 🤍 Елегантна шкіряна модель, чудове поєднання комфорту, стилю та практичності.';
    expect(findCopiedPhrase({ messageText, transcript: TRANSCRIPT })).toBe('чудове поєднання комфорту стилю');
  });

  it('lets the owner standard opening and closing through', () => {
    const messageText = 'Знайшла для Вас чудовий відеоогляд цієї сумки 🤍 Ця сумка створена щоб вражати 😍 Чи хотіли б Ви обрати її для себе?';
    expect(findCopiedPhrase({ messageText, transcript: `${TRANSCRIPT} Чи хотіли б Ви обрати її для себе?` })).toBeNull();
  });

  it('does not mind a few shared words', () => {
    const messageText = 'Знайшла для Вас чудовий відеоогляд цієї сумки 🤍 Така елегантна, дивіться, як їй личить комфорт';
    expect(findCopiedPhrase({ messageText, transcript: TRANSCRIPT })).toBeNull();
  });
});

describe('findBannedWord', () => {
  it('finds a diminutive of the bag in any form', () => {
    expect(findBannedWord('Ця сумочка створена щоб вражати')).toBe('сумочка');
    expect(findBannedWord('Знайшла для Вас кілька модельок')).toBe('модельок');
    expect(findBannedWord('Така гарна моделька, правда?')).toBe('моделька');
  });

  it('finds "виглядає" in any form', () => {
    expect(findBannedWord('Вона виглядає дуже якісно')).toBe('виглядає');
    expect(findBannedWord('Такі сумки виглядають стильно')).toBe('виглядають');
  });

  it('lets the plain words through', () => {
    expect(findBannedWord('Знайшла для Вас чудовий відеоогляд цієї сумки 🤍 Ця модель створена для Вас')).toBeNull();
  });
});

describe('findUnknownProduct', () => {
  it('flags a bag when the dialog speaks of a backpack', () => {
    const transcript = 'Менеджер: Рюкзак водонепроникний і дуже зручний. Клієнтка: Який колір є?';
    expect(findUnknownProduct({ messageText: 'Знайшла для Вас чудовий відеоогляд цієї сумки', transcript })).toBe('сумки');
  });

  it('lets the noun through when the dialog uses it, and the neutral word always', () => {
    const transcript = 'Менеджер: Рюкзак водонепроникний. Клієнтка: Дякую';
    expect(findUnknownProduct({ messageText: 'Знайшла для Вас чудовий відеоогляд цього рюкзака', transcript })).toBeNull();
    expect(findUnknownProduct({ messageText: 'Знайшла для Вас чудовий відеоогляд цієї моделі', transcript })).toBeNull();
  });
});
