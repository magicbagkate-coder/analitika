export type VideoFile = { fileId: string; fileName: string };

const ENTRY_PATTERN = /id="entry-([A-Za-z0-9_-]+)"[\s\S]*?class="flip-entry-title">([^<]*)</g;

function decodeTitle(rawTitle: string): string {
  const unescaped = rawTitle.replace(/&amp;/g, '&');
  try {
    return decodeURIComponent(unescaped);
  } catch {
    return unescaped;
  }
}

/**
 * The files of a public Drive folder from its embedded list page (drive.google.com/embeddedfolderview).
 * Titles come percent-encoded ("%D0%A11183B.mp4"). Only videos are kept.
 */
export function parseFolderListing(html: string): VideoFile[] {
  const files = [...html.matchAll(ENTRY_PATTERN)].map((match) => ({ fileId: match[1], fileName: decodeTitle(match[2]) }));
  return files.filter((file) => /\.(mp4|mov|m4v)$/i.test(file.fileName));
}
