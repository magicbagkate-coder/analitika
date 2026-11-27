const MIN_COPIED_WORDS = 4;

// The owner's own wording that every touch may repeat: the opening and the closing question.
const STANDARD_PHRASES = [
  'Знайшла для Вас чудовий відеоогляд',
  'Знайшла для Вас кілька чудових варіантів відправляю відеоогляди',
  'Чи хотіли б Ви обрати її для себе',
  'Якщо так допоможу з оформленням замовлення',
  'Допомогти з оформленням замовлення',
  'Який варіант Вам сподобався найбільше',
  'Чи вдалося Вам визначитися з вибором',
].map(normalize);

// Words the owner does not want in a touch (2026-11-27): diminutives ("сумка" and "модель", never "сумочка", "моделька")
// and "виглядає" ("вона якісна", not "виглядає дуже якісно").
const BANNED_STEMS = ['сумоч', 'модельк', 'модельок', 'рюкзачок', 'рюкзачк', 'гаманечк', 'клатчик', 'виглядає', 'виглядают', 'виглядат'];

// A product noun used in a message must be the one the dialog itself uses: a backpack is not "сумка" (owner, 2026-11-27).
const PRODUCT_STEMS = ['сумк', 'рюкзак', 'гаманц', 'гаманец', 'клатч', 'візитн', 'косметичк', 'шопер', 'кросбод', 'бананк'];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function wordRuns(piece: string): string[] {
  const words = piece.split(' ').filter((word) => word.length > 0);
  return words.slice(0, Math.max(0, words.length - MIN_COPIED_WORDS + 1)).map((_, index) => words.slice(index, index + MIN_COPIED_WORDS).join(' '));
}

/**
 * The owner does not want the manager's description of the bag pasted into the touch (2026-11-27). Returns the first
 * run of words the message shares with the dialog, ignoring her standard opening and closing phrases, or null.
 */
export function findCopiedPhrase(params: { messageText: string; transcript: string }): string | null {
  const dialog = ` ${normalize(params.transcript)} `;
  const withoutStandard = STANDARD_PHRASES.reduce((text, phrase) => text.split(phrase).join(' | '), normalize(params.messageText));
  const runs = withoutStandard.split('|').flatMap(wordRuns);
  return runs.find((run) => dialog.includes(` ${run} `)) ?? null;
}

/** The first word of the message the owner does not want (a diminutive, "виглядає"), or null. */
export function findBannedWord(messageText: string): string | null {
  const words = normalize(messageText).split(' ');
  return words.find((word) => BANNED_STEMS.some((stem) => word.startsWith(stem))) ?? null;
}

/** The first product noun of the message that the dialog never uses (so the bag is probably called by the wrong name), or null. */
export function findUnknownProduct(params: { messageText: string; transcript: string }): string | null {
  const dialog = normalize(params.transcript);
  const words = normalize(params.messageText).split(' ');
  return words.find((word) => PRODUCT_STEMS.some((stem) => word.startsWith(stem) && !dialog.includes(stem))) ?? null;
}
