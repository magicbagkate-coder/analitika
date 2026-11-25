import { chooseNewestFile } from './choose-newest-file';
import { findMatchingFiles } from './find-matching-files';

describe('chooseNewestFile', () => {
  it('takes the file with a number in brackets over the plain one', () => {
    expect(chooseNewestFile(['M1103.mp4', 'M1103(1).mp4'])).toBe('M1103(1).mp4');
  });

  it('takes the highest number when there are several copies', () => {
    expect(chooseNewestFile(['M1103-1P.mp4', 'M1103-1P (1).mp4', 'M1103-1P(2).mp4'])).toBe('M1103-1P(2).mp4');
  });

  it('keeps the first file when none has a number', () => {
    expect(chooseNewestFile(['6083.MP4', '6083.mp4'])).toBe('6083.MP4');
  });

  it('returns nothing for an empty list', () => {
    expect(chooseNewestFile([])).toBeUndefined();
  });

  it('works on what the article search returns', () => {
    const files = ['M1103.mp4', 'M1103(1).mp4', 'M1104.mp4'];
    expect(chooseNewestFile(findMatchingFiles('m1103', files))).toBe('M1103(1).mp4');
  });
});
