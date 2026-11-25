import { chooseNewestFile } from './choose-newest-file';
import { findMatchingFiles } from './find-matching-files';
import { normalizeArticle } from './normalize-article';

const MAX_NOTE_LENGTH = 30;
const MIN_ARTICLE_LENGTH = 3;

export type TouchVideoPick = {
  status: 'found' | 'no-video' | 'no-article';
  /** The article as the manager wrote it; null when no note looks like one. */
  article: string | null;
  fileName: string | null;
};

/** An article is a short note with at least one digit ("M1103-BL", "01023 Y2"); a sentence is not one. */
function looksLikeArticle(noteText: string): boolean {
  const trimmed = noteText.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NOTE_LENGTH) return false;
  return normalizeArticle(trimmed).length >= MIN_ARTICLE_LENGTH && /\d/.test(trimmed);
}

/**
 * The video for a chat from its internal notes, newest first (owner, 2026-11-25: a manager writes just the
 * article in a note). Notes that do not look like an article are skipped; the newest one that has a video wins.
 * "no-video" means an article was written but the folder has no file for it — the owner must upload one.
 */
export function pickTouchVideo(params: { noteTexts: string[]; fileNames: string[] }): TouchVideoPick {
  const articleNotes = params.noteTexts.map((noteText) => noteText.trim()).filter(looksLikeArticle);
  if (articleNotes.length === 0) return { status: 'no-article', article: null, fileName: null };

  for (const article of articleNotes) {
    const fileName = chooseNewestFile(findMatchingFiles(article, params.fileNames));
    if (fileName !== undefined) return { status: 'found', article, fileName };
  }
  return { status: 'no-video', article: articleNotes[0], fileName: null };
}
