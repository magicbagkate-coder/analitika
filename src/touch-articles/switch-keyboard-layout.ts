// Russian and Ukrainian letters on the keys of the Latin QWERTY layout: "Ь1103" is "M1103" typed with the wrong layout on.
const LAYOUT_LETTERS = new Map<string, string>([
  ['Й', 'Q'], ['Ц', 'W'], ['У', 'E'], ['К', 'R'], ['Е', 'T'], ['Н', 'Y'], ['Г', 'U'], ['Ш', 'I'], ['Щ', 'O'], ['З', 'P'],
  ['Ф', 'A'], ['Ы', 'S'], ['І', 'S'], ['В', 'D'], ['А', 'F'], ['П', 'G'], ['Р', 'H'], ['О', 'J'], ['Л', 'K'], ['Д', 'L'],
  ['Я', 'Z'], ['Ч', 'X'], ['С', 'C'], ['М', 'V'], ['И', 'B'], ['Т', 'N'], ['Ь', 'M'],
]);

/** Cyrillic letters replaced by the Latin letters on the same keys; everything else stays as it was. */
export function switchKeyboardLayout(rawArticle: string): string {
  return [...rawArticle.toUpperCase()].map((letter) => LAYOUT_LETTERS.get(letter) ?? letter).join('');
}
