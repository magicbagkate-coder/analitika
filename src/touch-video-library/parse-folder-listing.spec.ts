import { buildVideoUrl } from './build-video-url';
import { parseFolderListing } from './parse-folder-listing';

const ENTRY = (id: string, title: string): string =>
  `<div class="flip-entry" id="entry-${id}" tabindex="0"><div class="flip-entry-info"><a href="x"><div class="flip-entry-title">${title}</div></a></div></div>`;

describe('parseFolderListing', () => {
  it('reads id and decoded title of every video', () => {
    const html = ENTRY('1abc-_X', '%D0%A11183B.mp4') + ENTRY('2def', '01014%201100.mp4') + ENTRY('3ghi', 'M1103(1).mp4');
    expect(parseFolderListing(html)).toEqual([
      { fileId: '1abc-_X', fileName: 'С1183B.mp4' },
      { fileId: '2def', fileName: '01014 1100.mp4' },
      { fileId: '3ghi', fileName: 'M1103(1).mp4' },
    ]);
  });

  it('keeps only video files', () => {
    expect(parseFolderListing(ENTRY('1a', 'notes.txt') + ENTRY('2b', '6132.MP4')).map((file) => file.fileId)).toEqual(['2b']);
  });

  it('returns nothing for a page without entries', () => {
    expect(parseFolderListing('<html>no files</html>')).toEqual([]);
  });
});

describe('buildVideoUrl', () => {
  it('ends with .mp4 so Sitniks sends it as a video', () => {
    expect(buildVideoUrl('1abc')).toBe('https://drive.usercontent.google.com/download?id=1abc&export=download&name=1abc.mp4');
  });
});
