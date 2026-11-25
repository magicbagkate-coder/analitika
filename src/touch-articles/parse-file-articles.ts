import { normalizeArticle } from './normalize-article';

const VIDEO_EXTENSION = /\.(mp4|mov|m4v)$/i;
// "dot + space" separates articles, while a dot INSIDE one ("0320.281") stays part of it.
const ARTICLE_SEPARATOR = /\.\s+|[,;]/;
// "M1103(1).mp4" is a second upload of M1103 — the "(1)" is not a digit of the article.
const COPY_MARK = /\s*\(\d+\)/g;
const DOTTED_ARTICLE = /\d\.\d/;

/** "0972.356 0972.355" is two articles written with a plain space; "01023 Y2" is one article with a space in it. */
function splitDottedTokens(part: string): string[] {
  const tokens = part.trim().split(/\s+/);
  return tokens.length > 1 && tokens.every((token) => DOTTED_ARTICLE.test(token)) ? tokens : [part];
}

/**
 * Every article a video file is named for: "01023 Y1. 01023 Y2. 01023 Y4.mp4" fits all three,
 * so it returns ["01023Y1", "01023Y2", "01023Y4"].
 */
export function parseFileArticles(fileName: string): string[] {
  const articles = fileName
    .replace(VIDEO_EXTENSION, '')
    .replace(COPY_MARK, '')
    .split(ARTICLE_SEPARATOR)
    .flatMap(splitDottedTokens)
    .map(normalizeArticle)
    .filter((article) => article.length > 0);
  return [...new Set(articles)];
}
