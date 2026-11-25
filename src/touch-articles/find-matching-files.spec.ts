import { findMatchingFiles } from './find-matching-files';
import { normalizeArticle } from './normalize-article';
import { parseFileArticles } from './parse-file-articles';

const REAL_FILES = [
  '01023 Y1. 01023 Y2. 01023 Y4.mp4',
  '0320.281. 0320.213. 0320.286.mp4',
  '6132.mp4',
  '91332.mp4',
  'C0944-BL.mp4',
];

describe('normalizeArticle', () => {
  it('ignores spaces, dots, dashes and letter case', () => {
    expect(['01023Y2', '01 023 Y2', '01.023.y2', '01-023-y2'].map(normalizeArticle)).toEqual(Array(4).fill('01023Y2'));
  });

  it('reads Cyrillic lookalike letters as their Latin twins', () => {
    expect(normalizeArticle('010 23 У2')).toBe('01023Y2');
    expect(normalizeArticle('С1035Н')).toBe('C1035H');
  });

  it('keeps leading zeros', () => {
    expect(normalizeArticle('01023')).not.toBe(normalizeArticle('1023'));
  });
});

describe('parseFileArticles', () => {
  it('splits one file name into every article it carries', () => {
    expect(parseFileArticles(REAL_FILES[0])).toEqual(['01023Y1', '01023Y2', '01023Y4']);
    expect(parseFileArticles(REAL_FILES[1])).toEqual(['0320281', '0320213', '0320286']);
  });

  it('splits articles that are separated by a plain space when each one has a dot', () => {
    expect(parseFileArticles('0972.356 0972.355.mp4')).toEqual(['0972356', '0972355']);
    expect(parseFileArticles('0320.281 0320.1905 0320.1005..mp4')).toEqual(['0320281', '03201905', '03201005']);
  });

  it('keeps a single-article name whole, with or without a dash', () => {
    expect(parseFileArticles('6132.mp4')).toEqual(['6132']);
    expect(parseFileArticles('C0944-BL.mp4')).toEqual(['C0944BL']);
  });
});

describe('findMatchingFiles', () => {
  it('finds a multi-article file from any one of its articles', () => {
    expect(findMatchingFiles('01023Y2', REAL_FILES)).toEqual([REAL_FILES[0]]);
    expect(findMatchingFiles('0320 286', REAL_FILES)).toEqual([REAL_FILES[1]]);
  });

  it('matches regardless of how the manager wrote spaces, dots and case', () => {
    expect(findMatchingFiles('c0944 bl', REAL_FILES)).toEqual(['C0944-BL.mp4']);
    expect(findMatchingFiles('91 332', REAL_FILES)).toEqual(['91332.mp4']);
  });

  it('never matches a part of an article', () => {
    expect(findMatchingFiles('1332', REAL_FILES)).toEqual([]);
    expect(findMatchingFiles('0102', REAL_FILES)).toEqual([]);
  });

  it('returns every file when the same article sits in several of them', () => {
    expect(findMatchingFiles('6132', ['6132.mp4', '6132 v2.mp4', '6132. 7000.mp4'])).toEqual(['6132.mp4', '6132. 7000.mp4']);
  });

  it('finds a file named with a Cyrillic twin letter from the Latin or the Cyrillic spelling', () => {
    const files = ['С1183B.mp4'];
    expect(findMatchingFiles('C1183B', files)).toEqual(files);
    expect(findMatchingFiles('С1183В', files)).toEqual(files);
  });

  it('finds an article typed with the wrong keyboard layout', () => {
    expect(findMatchingFiles('Ь1103', ['M1103.mp4', 'M1104.mp4'])).toEqual(['M1103.mp4']);
    expect(findMatchingFiles('Ь9999', ['M1103.mp4'])).toEqual([]);
  });

  it('finds an article typed with the letter O for zero', () => {
    expect(findMatchingFiles('C0944-BL'.replace('0', 'O'), REAL_FILES)).toEqual(['C0944-BL.mp4']);
  });

  it('prefers the exact reading over a looser guess', () => {
    expect(findMatchingFiles('M1103', ['M1103.mp4', 'Ь1103.mp4'])).toEqual(['M1103.mp4']);
  });

  it('treats "(1)" copies as the same article', () => {
    expect(findMatchingFiles('M1103-BL', ['M1103-BL (1).mp4', 'M1103-BL(2)..mp4', 'M1103.mp4'])).toEqual(['M1103-BL (1).mp4', 'M1103-BL(2)..mp4']);
  });

  it('matches nothing for a note with no letters or digits', () => {
    expect(findMatchingFiles(' .. ', REAL_FILES)).toEqual([]);
  });
});
