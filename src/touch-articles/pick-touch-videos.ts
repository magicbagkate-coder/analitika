import { chooseNewestFile } from './choose-newest-file';
import { findMatchingFiles } from './find-matching-files';
import { normalizeArticle } from './normalize-article';

const MAX_PART_LENGTH = 30;
const MAX_ARTICLES_IN_NOTE = 8;
const MIN_ARTICLE_LENGTH = 3;
/** One touch carries at most this many videos, however many articles the manager listed. */
export const MAX_TOUCH_VIDEOS = 5;

export type FoundVideo = { article: string; fileName: string };

export type TouchVideosPick = {
  status: 'found' | 'no-video' | 'no-article';
  /** The articles of the chosen note as the manager wrote them; empty when no note looks like one. */
  articles: string[];
  found: FoundVideo[];
  /** Articles of that note that have no video in the folder. */
  missing: string[];
};

/** An article is a short piece with at least one digit ("M1103-BL", "01023 Y2"); a sentence is not one. */
function looksLikeArticle(part: string): boolean {
  if (part.length > MAX_PART_LENGTH) return false;
  return normalizeArticle(part).length >= MIN_ARTICLE_LENGTH && /\d/.test(part);
}

/** "990318, 990320" is two articles (owner, 2026-11-26); every piece must look like an article or the note is plain text. */
function readArticleNote(noteText: string): string[] | null {
  const parts = noteText.split(/[,;\n]/).map((part) => part.trim()).filter((part) => part.length > 0);
  const isArticleList = parts.length > 0 && parts.length <= MAX_ARTICLES_IN_NOTE && parts.every(looksLikeArticle);
  return isArticleList ? parts : null;
}

/**
 * The videos for a chat from its internal notes, newest first. Notes that are not an article list are skipped; the
 * newest one with at least one video wins. Each article gets its newest file, and two articles that sit in one
 * file give that file once. "no-video" means articles were written but the folder has none of them.
 */
export function pickTouchVideos(params: { noteTexts: string[]; fileNames: string[] }): TouchVideosPick {
  const articleNotes = params.noteTexts.map(readArticleNote).filter((articles): articles is string[] => articles !== null);
  if (articleNotes.length === 0) return { status: 'no-article', articles: [], found: [], missing: [] };

  for (const articles of articleNotes) {
    const matched = articles.map((article) => ({ article, fileName: chooseNewestFile(findMatchingFiles(article, params.fileNames)) }));
    const found = matched.filter((item): item is FoundVideo => item.fileName !== undefined);
    const distinct = found.filter((item, index) => found.findIndex((other) => other.fileName === item.fileName) === index);
    if (distinct.length > 0) {
      return { status: 'found', articles, found: distinct.slice(0, MAX_TOUCH_VIDEOS), missing: matched.filter((item) => item.fileName === undefined).map((item) => item.article) };
    }
  }
  return { status: 'no-video', articles: articleNotes[0], found: [], missing: articleNotes[0] };
}
