// Cyrillic letters that look identical to Latin ones — managers type them by accident (У instead of Y).
const LOOKALIKE_LETTERS = new Map<string, string>([
  ['А', 'A'],
  ['В', 'B'],
  ['С', 'C'],
  ['Е', 'E'],
  ['Н', 'H'],
  ['І', 'I'],
  ['К', 'K'],
  ['М', 'M'],
  ['О', 'O'],
  ['Р', 'P'],
  ['Т', 'T'],
  ['Х', 'X'],
  ['У', 'Y'],
]);

/**
 * One canonical form for an article: upper-case Latin letters and digits only, so "01 023 y2",
 * "01.023.Y2" and "01023-У2" all become "01023Y2". Leading zeros are kept — "01023" is not "1023".
 */
export function normalizeArticle(rawArticle: string): string {
  const latinText = [...rawArticle.toUpperCase()].map((letter) => LOOKALIKE_LETTERS.get(letter) ?? letter).join('');
  return latinText.replace(/[^A-Z0-9]/g, '');
}
