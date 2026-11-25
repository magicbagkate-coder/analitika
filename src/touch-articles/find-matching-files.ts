import { normalizeArticle } from './normalize-article';
import { parseFileArticles } from './parse-file-articles';
import { switchKeyboardLayout } from './switch-keyboard-layout';

type FileArticles = { fileName: string; articles: string[] };

// O typed for 0 and I for 1 are the usual slips; applied to BOTH sides so a real "O" in an article still matches itself.
function readLettersAsDigits(article: string): string {
  return article.replace(/O/g, '0').replace(/I/g, '1');
}

function keepAsIs(article: string): string {
  return article;
}

function filesWithArticle(params: { files: FileArticles[]; article: string; shape: (article: string) => string }): string[] {
  if (params.article.length === 0) return [];
  return params.files.filter((file) => file.articles.some((candidate) => params.shape(candidate) === params.shape(params.article))).map((file) => file.fileName);
}

/**
 * Files whose name carries the article written in a chat note; whole-article match only, never a part of one.
 * The note is read as written first (Cyrillic twins of Latin letters already count as the same letter);
 * only when nothing is found, as if typed with the wrong keyboard layout, and then with O/I read as 0/1.
 * The first reading that finds files wins, so a loose guess never overrides an exact one.
 */
export function findMatchingFiles(noteText: string, fileNames: string[]): string[] {
  const files = fileNames.map((fileName) => ({ fileName, articles: parseFileArticles(fileName) }));
  const asWritten = normalizeArticle(noteText);
  const readings = [
    { article: asWritten, shape: keepAsIs },
    { article: normalizeArticle(switchKeyboardLayout(noteText)), shape: keepAsIs },
    { article: asWritten, shape: readLettersAsDigits },
  ];

  for (const reading of readings) {
    const found = filesWithArticle({ files, ...reading });
    if (found.length > 0) return found;
  }
  return [];
}
