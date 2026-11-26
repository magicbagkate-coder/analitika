import { pickTouchVideos } from './pick-touch-videos';

const FILES = ['M1103.mp4', 'M1103(1).mp4', '01023 Y1. 01023 Y2. 01023 Y4.mp4', 'С1183B.mp4', '990318.mp4', '990320.mp4'];

describe('pickTouchVideos', () => {
  it('finds the newest video for the article written in a note', () => {
    expect(pickTouchVideos({ noteTexts: ['m1103'], fileNames: FILES })).toEqual({
      status: 'found',
      articles: ['m1103'],
      found: [{ article: 'm1103', fileName: 'M1103(1).mp4' }],
      missing: [],
    });
  });

  it('takes one video per article when the note lists several, separated by commas', () => {
    const pick = pickTouchVideos({ noteTexts: ['990318, 990320'], fileNames: FILES });
    expect(pick.found.map((item) => item.fileName)).toEqual(['990318.mp4', '990320.mp4']);
    expect(pick.missing).toEqual([]);
  });

  it('sends what it has and names the articles that have no video', () => {
    const pick = pickTouchVideos({ noteTexts: ['990318, X9999, 990320'], fileNames: FILES });
    expect(pick.status).toBe('found');
    expect(pick.found.map((item) => item.fileName)).toEqual(['990318.mp4', '990320.mp4']);
    expect(pick.missing).toEqual(['X9999']);
  });

  it('gives a file once when two articles sit in the same file', () => {
    const pick = pickTouchVideos({ noteTexts: ['01023 Y1, 01023 Y2'], fileNames: FILES });
    expect(pick.found).toHaveLength(1);
  });

  it('limits one touch to five videos', () => {
    const files = ['1111.mp4', '2222.mp4', '3333.mp4', '4444.mp4', '5555.mp4', '6666.mp4'];
    expect(pickTouchVideos({ noteTexts: ['1111, 2222, 3333, 4444, 5555, 6666'], fileNames: files }).found).toHaveLength(5);
  });

  it('skips notes that are sentences, also ones with commas, and uses the one that is an article list', () => {
    const noteTexts = ['Клієнтка просила, 2 штуки, передзвонити', '990318', 'Оплата в п\'ятницю'];
    expect(pickTouchVideos({ noteTexts, fileNames: FILES }).found.map((item) => item.fileName)).toEqual(['990318.mp4']);
  });

  it('goes by the newest article note, even when an older note has a video and the newest one has none', () => {
    const pick = pickTouchVideos({ noteTexts: ['X9999', 'C1183B'], fileNames: FILES });
    expect(pick).toEqual({ status: 'no-video', articles: ['X9999'], found: [], missing: ['X9999'] });
  });

  it('takes the newest note even when it is a different article from an older one', () => {
    expect(pickTouchVideos({ noteTexts: ['C1183B', '990318'], fileNames: FILES }).found.map((item) => item.fileName)).toEqual(['С1183B.mp4']);
  });

  it('says the video is missing when articles are written but the folder has none of them', () => {
    expect(pickTouchVideos({ noteTexts: ['X9999, Y8888'], fileNames: FILES })).toEqual({ status: 'no-video', articles: ['X9999', 'Y8888'], found: [], missing: ['X9999', 'Y8888'] });
  });

  it('says there is no article when no note looks like one', () => {
    expect(pickTouchVideos({ noteTexts: ['Просила зателефонувати', ''], fileNames: FILES }).status).toBe('no-article');
    expect(pickTouchVideos({ noteTexts: [], fileNames: FILES }).status).toBe('no-article');
  });
});
