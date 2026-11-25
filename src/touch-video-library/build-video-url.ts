/**
 * The link Sitniks downloads a video from. Sitniks tells the message type from the URL ending, so a
 * `.mp4` name is appended: without it the video arrives as a plain file link (tested live, 2026-11-19).
 */
export function buildVideoUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&name=${fileId}.mp4`;
}
