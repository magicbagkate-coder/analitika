const MIN_COPIED_WORDS = 4;

// The owner's own wording that every touch may repeat: the opening and the closing question.
const STANDARD_PHRASES = [
  'Знайшла для Вас чудовий відеоогляд цієї сумочки',
  'Знайшла для Вас кілька чудових варіантів відправляю відеоогляди',
  'Чи хотіли б Ви обрати її для себе',
  'Якщо так допоможу з оформленням замовлення',
  'Допомогти з оформленням замовлення',
  'Який варіант Вам сподобався найбільше',
  'Чи вдалося Вам визначитися з вибором',
].map(normalize);

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
